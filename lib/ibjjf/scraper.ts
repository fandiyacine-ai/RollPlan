import { chromium, type Browser } from 'playwright'

const IBJJF_BASE = 'https://ibjjf.com'

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
]

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true, args: BROWSER_ARGS })
}

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })
  return ctx.newPage()
}

export type IbjjfAthleteRef = {
  name: string
  athleteId: string
  profileUrl: string
}

export type IbjjfCompetition = {
  eventName: string
  eventId: string
  eventUrl: string
  date: string | null
  placement: string | null
}

// Search IBJJF for an athlete by name.
// Tries their JSON API first; falls back to Playwright page scraping.
export async function searchIbjjfAthleteByName(name: string): Promise<IbjjfAthleteRef | null> {
  // API-first attempt — IBJJF exposes a search endpoint used by their own UI
  try {
    const encoded = encodeURIComponent(name)
    const resp = await fetch(`${IBJJF_BASE}/api/v1/athletes/search.json?name=${encoded}`, {
      headers: {
        'Referer': `${IBJJF_BASE}/athletes`,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (resp.ok) {
      const data = await resp.json() as { athletes?: Array<{ id: number; name: string }> }
      const athletes = data.athletes ?? []
      if (athletes.length > 0) {
        const nameLower = name.toLowerCase()
        const exact = athletes.find(a => a.name.toLowerCase() === nameLower)
        const best = exact ?? athletes[0]
        return {
          name: best.name,
          athleteId: String(best.id),
          profileUrl: `${IBJJF_BASE}/athlete/${best.id}`,
        }
      }
    }
  } catch { /* fall through to Playwright */ }

  // Playwright fallback — scrape the athletes search page
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    const encoded = encodeURIComponent(name)
    // IBJJF uses both /athletes?search= and /athletes?name= depending on version
    await page.goto(`${IBJJF_BASE}/athletes?search=${encoded}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000)

    const result = await page.evaluate((targetName: string) => {
      const nameParts = targetName.toLowerCase().split(' ').filter(p => p.length > 1)
      const threshold = Math.ceil(nameParts.length * 0.6)
      const links = Array.from(document.querySelectorAll('a[href*="/athlete/"]'))

      for (const el of links) {
        const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (text.length < 2) continue
        const textLower = text.toLowerCase()
        const matchCount = nameParts.filter(p => textLower.includes(p)).length
        if (matchCount >= threshold) {
          const href = (el as HTMLAnchorElement).href
          const m = href.match(/\/athlete\/([^/?#\s]+)/)
          if (!m) continue
          return { name: text, athleteId: m[1], profileUrl: href }
        }
      }
      return null
    }, name)

    return result
  } catch {
    return null
  } finally {
    await browser.close()
  }
}

// Scrape competition history from an IBJJF athlete profile page.
export async function scrapeIbjjfAthleteHistory(profileUrl: string): Promise<IbjjfCompetition[]> {
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    await page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(4000)

    const competitions = await page.evaluate((base: string) => {
      const results: Array<{
        eventName: string
        eventId: string
        eventUrl: string
        date: string | null
        placement: string | null
      }> = []
      const seen = new Set<string>()

      function tryParseDate(text: string): string | null {
        const m = text.match(
          /\d{4}[-\/]\d{2}[-\/]\d{2}|\b\d{1,2}[-\/]\d{1,2}[-\/]\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i
        )
        if (!m) return null
        try {
          const d = new Date(m[0])
          return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
        } catch { return null }
      }

      // Strategy 1: event links present in the page
      const eventLinks = Array.from(document.querySelectorAll(
        'a[href*="/event/"], a[href*="/championship/"], a[href*="/competition/"], a[href*="/tournament/"]'
      ))
      for (const el of eventLinks) {
        const href = (el as HTMLAnchorElement).href
        const m = href.match(/\/(?:event|championship|competition|tournament)\/([^/?#]+)/)
        if (!m) continue
        const rawId = m[1]
        const eventId = `ibjjf-${rawId}`
        if (seen.has(eventId)) continue
        seen.add(eventId)

        const eventName = (el.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (eventName.length < 3) continue

        const row = el.closest('tr, li, [class*="result"], [class*="competition"], [class*="event"], [class*="row"]')
        const ctx = (row?.textContent ?? el.textContent ?? '').replace(/\s+/g, ' ')
        const placM = ctx.match(/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|gold|silver|bronze|champion|runner[- ]?up)\b/i)

        results.push({
          eventName,
          eventId,
          eventUrl: href,
          date: tryParseDate(ctx),
          placement: placM?.[0] ?? null,
        })
      }

      // Strategy 2: table rows (IBJJF renders results in tables)
      if (results.length === 0) {
        document.querySelectorAll('table tbody tr').forEach(row => {
          const cells = Array.from(row.querySelectorAll('td'))
          if (cells.length < 2) return
          const rowText = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (rowText.length < 10) return

          const link = row.querySelector<HTMLAnchorElement>('a')
          const eventName = (link?.textContent ?? cells[0]?.textContent ?? '').trim().replace(/\s+/g, ' ')
          if (eventName.length < 3) return

          const href = link?.href ?? `${base}/events`
          const m = href.match(/\/(?:event|championship|competition|tournament)\/([^/?#]+)/)
          const eventId = m ? `ibjjf-${m[1]}` : `ibjjf-row-${rowText.slice(0, 20).replace(/[^a-z0-9]/gi, '-')}`
          if (seen.has(eventId)) return
          seen.add(eventId)

          const placM = rowText.match(/\b(1st|2nd|3rd|4th|5th|gold|silver|bronze|champion)\b/i)
          results.push({
            eventName,
            eventId,
            eventUrl: href,
            date: tryParseDate(rowText),
            placement: placM?.[0] ?? null,
          })
        })
      }

      return results
    }, IBJJF_BASE)

    return competitions
  } catch {
    return []
  } finally {
    await browser.close()
  }
}
