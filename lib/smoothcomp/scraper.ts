import { chromium, type Browser, type Page } from 'playwright'
import type {
  ScBracketResult,
  ScAthleteRef,
  ScBracketMatch,
  ScAthleteProfile,
  ScPastCompetition,
  ScEventStreams,
} from './types'

const SC_BASE = 'https://smoothcomp.com'

// Wait for Firebase-loaded content by checking that the loading spinner is gone
// and at least one real content element is present
async function waitForFirebase(page: Page, selector: string, timeout = 15000) {
  await page.waitForSelector(selector, { timeout })
}

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

// Standard page for event/bracket/stream pages (no Cloudflare)
async function newPage(browser: Browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  })
  return ctx.newPage()
}

// Stealth page for profile pages (Cloudflare-protected)
async function newStealthPage(browser: Browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
    },
  })
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).chrome = { runtime: {} }
  })
  return page
}

// Extract event ID and bracket ID from a Smoothcomp bracket URL
// e.g. https://smoothcomp.com/en/event/28950/bracket/1935117
export function parseSmootcompBracketUrl(url: string): { eventId: string; bracketId: string } | null {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/event\/(\d+)\/bracket\/(\d+)/)
    if (!m) return null
    return { eventId: m[1], bracketId: m[2] }
  } catch {
    return null
  }
}

// Extract event ID from any Smoothcomp event URL
export function parseSmootcompEventUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/event\/(\d+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export async function scrapeBracket(bracketUrl: string): Promise<ScBracketResult | null> {
  const parsed = parseSmootcompBracketUrl(bracketUrl)
  if (!parsed) return null

  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    await page.goto(bracketUrl, { waitUntil: 'networkidle' })

    // Check if bracket is published — look for athlete names or a "not published" message
    const notPublished = await page.$('[data-testid="brackets-not-published"], .brackets-not-published')
      .catch(() => null)
    if (notPublished) {
      return {
        eventId: parsed.eventId,
        bracketId: parsed.bracketId,
        divisionName: '',
        athletes: [],
        matches: [],
        bracketIsPublished: false,
      }
    }

    // Wait for bracket content to load
    await page.waitForTimeout(3000) // Firebase needs time after networkidle

    // Extract division name from page heading
    const divisionName = await page.$eval(
      'h1, h2, .bracket-title, .division-title, [class*="title"]',
      el => el.textContent?.trim() ?? ''
    ).catch(() => '')

    // Extract all athlete entries — Smoothcomp renders them as linked items with profile URLs
    const athleteData = await page.evaluate(() => {
      const results: Array<{ name: string; profileUrl: string; athleteId: string }> = []
      const seen = new Set<string>()

      // Look for links to athlete profiles
      const links = document.querySelectorAll('a[href*="/profile/"]')
      for (const link of Array.from(links)) {
        const href = (link as HTMLAnchorElement).href
        const name = link.textContent?.trim()
        if (!href || !name || name.length < 2) continue

        const idMatch = href.match(/\/profile\/(\d+)/)
        if (!idMatch) continue
        const athleteId = idMatch[1]

        if (seen.has(athleteId)) continue
        seen.add(athleteId)

        results.push({ name, profileUrl: href, athleteId })
      }
      return results
    })

    const athletes: ScAthleteRef[] = athleteData.map(a => ({
      name: a.name,
      smoothcompAthleteId: a.athleteId,
      profileUrl: a.profileUrl,
    }))

    // Extract match results if bracket is complete
    const matchData = await page.evaluate(() => {
      const matches: Array<{
        athlete1Id: string | null
        athlete2Id: string | null
        winnerId: string | null
        method: string | null
        technique: string | null
      }> = []

      // Look for match containers — each bout shows two competitors and a result
      // Smoothcomp renders bouts as rows/cards; look for winner indicators
      const matchEls = document.querySelectorAll('[class*="match"], [class*="bout"], [class*="fight"]')
      for (const el of Array.from(matchEls)) {
        const links = el.querySelectorAll('a[href*="/profile/"]')
        if (links.length < 2) continue

        const ids = Array.from(links).map(l => {
          const m = (l as HTMLAnchorElement).href.match(/\/profile\/(\d+)/)
          return m ? m[1] : null
        })

        // Check for winner indicator (highlighted/colored competitor)
        const winnerEl = el.querySelector('[class*="winner"], [class*="highlight"]')
        const winnerId = winnerEl
          ? (() => {
              const wLink = winnerEl.querySelector('a[href*="/profile/"]') ?? winnerEl.closest('a[href*="/profile/"]')
              const m = (wLink as HTMLAnchorElement | null)?.href?.match(/\/profile\/(\d+)/)
              return m ? m[1] : null
            })()
          : null

        // Look for result text (submission, points, etc.)
        const resultText = el.textContent?.toLowerCase() ?? ''
        const method = resultText.includes('sub') ? 'submission'
          : resultText.includes('point') ? 'points'
          : resultText.includes('dq') ? 'dq'
          : resultText.includes('walkover') || resultText.includes('w/o') ? 'walkover'
          : null

        matches.push({
          athlete1Id: ids[0] ?? null,
          athlete2Id: ids[1] ?? null,
          winnerId,
          method,
          technique: null,
        })
      }
      return matches
    })

    const matches: ScBracketMatch[] = matchData.map(m => ({
      athlete1: athletes.find(a => a.smoothcompAthleteId === m.athlete1Id) ?? null,
      athlete2: athletes.find(a => a.smoothcompAthleteId === m.athlete2Id) ?? null,
      winnerAthleteId: m.winnerId,
      method: m.method,
      technique: m.technique,
    }))

    return {
      eventId: parsed.eventId,
      bracketId: parsed.bracketId,
      divisionName,
      athletes,
      matches,
      bracketIsPublished: athletes.length > 0,
    }
  } finally {
    await browser.close()
  }
}

export async function scrapeAthleteProfile(profileUrl: string): Promise<ScAthleteProfile | null> {
  const athleteIdMatch = profileUrl.match(/\/profile\/(\d+)/)
  if (!athleteIdMatch) return null
  const athleteId = athleteIdMatch[1]

  const browser = await launchBrowser()
  try {
    const page = await newStealthPage(browser)
    await page.goto(profileUrl, { waitUntil: 'load', timeout: 30000 })
    // Give Firebase time to render the profile and competition history
    await page.waitForTimeout(5000)

    const profileData = await page.evaluate(() => {
      const bodyText = document.body.textContent?.toLowerCase() ?? ''
      // Cloudflare challenge means we can't determine public/private — treat as blocked
      const isCloudflareChallenge = bodyText.includes('security verification') || bodyText.includes('checking your browser') || bodyText.includes('ddos-guard')
      const isPrivate = isCloudflareChallenge || (
        bodyText.includes('private profile') ||
        bodyText.includes('profile is private') ||
        bodyText.includes('hidden profile') ||
        document.querySelector('[class*="private"]') !== null
      )

      // Name: look for the largest visible text that isn't nav/footer
      // Smoothcomp renders athlete name in a heading inside the profile card
      let name = ''
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      for (const h of headings) {
        const t = h.textContent?.trim() ?? ''
        // Skip nav items (short) and site name
        if (t.length > 3 && t.length < 60 && !t.toLowerCase().includes('smoothcomp') && !t.toLowerCase().includes('log in')) {
          name = t
          break
        }
      }

      // Profile photo
      let photoUrl: string | null = null
      const imgs = Array.from(document.querySelectorAll('img'))
      for (const img of imgs) {
        const src = img.src
        if (src.includes('profile') || src.includes('avatar') || src.includes('user') || src.includes('pictures/p/')) {
          photoUrl = src
          break
        }
      }

      // Past competitions: links to /event/ pages on the profile
      const comps: Array<{ eventName: string; eventId: string; eventUrl: string; date: string | null; placement: string | null }> = []
      const seen = new Set<string>()
      document.querySelectorAll('a[href*="/event/"]').forEach(el => {
        const href = (el as HTMLAnchorElement).href
        const m = href.match(/\/event\/(\d+)/)
        if (!m) return
        const eventId = m[1]
        if (seen.has(eventId)) return
        seen.add(eventId)
        const eventName = (el.textContent?.trim() ?? '')
        if (eventName.length < 2) return
        const parent = el.closest('tr, li, [class*="competition"], [class*="result"], [class*="event"]')
        const ctx = parent?.textContent ?? ''
        const dateM = ctx.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[.\/ ]\w+[.\/ ]\d{4}/)
        const placM = ctx.match(/\b(1st|2nd|3rd|\d+th|gold|silver|bronze)\b/i)
        comps.push({ eventName, eventId, eventUrl: href, date: dateM?.[0] ?? null, placement: placM?.[0] ?? null })
      })

      return { isPrivate, name, photoUrl, comps }
    })

    if (profileData.isPrivate) {
      return { athleteId, name: '', isPublic: false, pastCompetitions: [], photoUrl: null }
    }

    const comps = profileData.comps

    // For each past competition, try to find a YouTube recording
    const pastCompetitions: ScPastCompetition[] = []
    for (const comp of comps.slice(0, 5)) { // limit to last 5 events
      const youtubeUrl = await findEventYouTubeStream(comp.eventId).catch(() => null)
      pastCompetitions.push({ ...comp, youtubeUrl })
    }

    return {
      athleteId,
      name: profileData.name,
      isPublic: true,
      pastCompetitions,
      photoUrl: profileData.photoUrl,
    }
  } finally {
    await browser.close()
  }
}

// Scrape the livestreams/streams tab of an event to find YouTube URLs with mat labels
export async function scrapeEventStreams(eventId: string): Promise<ScEventStreams> {
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    await page.goto(`${SC_BASE}/en/event/${eventId}/livestream`, { waitUntil: 'load', timeout: 30000 })
    // Give Firebase time to render the stream list
    await page.waitForTimeout(5000)

    const streams = await page.evaluate(() => {
      const results: Array<{ label: string; youtubeUrl: string }> = []
      const seen = new Set<string>()
      const ytRe = /(?:embed\/|v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
      const labelSel = 'h1, h2, h3, h4, [class*="title"], [class*="label"], [class*="name"], [class*="mat"]'

      // iframes
      document.querySelectorAll('iframe[src*="youtube"], iframe[src*="youtu.be"]').forEach(el => {
        const src = (el as HTMLIFrameElement).src
        const m = src.match(ytRe)
        if (!m) return
        const url = `https://www.youtube.com/watch?v=${m[1]}`
        if (seen.has(url)) return
        seen.add(url)
        let label = `Stream ${results.length + 1}`
        let node: Element | null = el
        for (let i = 0; i < 6; i++) {
          node = node?.parentElement ?? null
          if (!node) break
          const h = node.querySelector(labelSel)
          const t = h?.textContent?.trim()
          if (t && t.length > 0 && t.length < 80) { label = t; break }
        }
        results.push({ label, youtubeUrl: url })
      })

      // links
      document.querySelectorAll('a[href*="youtube.com/watch"], a[href*="youtu.be"]').forEach(el => {
        const href = (el as HTMLAnchorElement).href
        if (seen.has(href)) return
        seen.add(href)
        const raw = (el.textContent?.trim() ?? '').replace(/^https?:\/\/.*/, '')
        let label = raw.length > 1 ? raw : `Stream ${results.length + 1}`
        if (label.startsWith('Stream')) {
          let node: Element | null = el
          for (let i = 0; i < 6; i++) {
            node = node?.parentElement ?? null
            if (!node) break
            const h = node.querySelector(labelSel)
            const t = h?.textContent?.trim()
            if (t && t.length > 0 && t.length < 80) { label = t; break }
          }
        }
        results.push({ label, youtubeUrl: href })
      })

      return results
    })

    return { eventId, streams }
  } finally {
    await browser.close()
  }
}

// Lightweight helper: just fetch YouTube streams for an event (reuses scrapeEventStreams)
async function findEventYouTubeStream(eventId: string): Promise<string | null> {
  const result = await scrapeEventStreams(eventId)
  return result.streams[0]?.youtubeUrl ?? null
}

type ScrapedEvent = { name: string; eventId: string; url: string; date: string | null; location: string | null }

// Scrape ibjjf.com events calendar for upcoming competitions.
// Selectors are best-effort — IBJJF may update their site structure.
export async function scrapeIbjjfEvents(): Promise<ScrapedEvent[]> {
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)

    // Try the calendar page, then fall back to the plain events list
    for (const url of ['https://ibjjf.com/events/calendar', 'https://ibjjf.com/events']) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(3000)
        break
      } catch { /* try next */ }
    }

    const todayIso = new Date().toISOString().slice(0, 10)

    const events = await page.evaluate((today: string) => {
      const results: Array<{ name: string; eventId: string; url: string; date: string | null; location: string | null }> = []
      const seen = new Set<string>()

      // IBJJF renders event detail links like /events/european-open-2026
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href]')
      for (const link of Array.from(links)) {
        const href = link.href
        // Must look like an event detail URL, not nav links
        const slugM = href.match(/\/events\/([a-z0-9][a-z0-9-]+[a-z0-9])(?:[/?#]|$)/)
        if (!slugM) continue
        const slug = slugM[1]
        // Skip generic pages
        if (['calendar', 'schedule', 'results', 'register', 'athletes'].includes(slug)) continue
        if (seen.has(slug)) continue
        seen.add(slug)

        // Name: prefer a heading inside the link, then the link text itself
        const nameEl = link.querySelector('h1,h2,h3,h4,[class*="title"],[class*="name"]')
        const rawName = (nameEl?.textContent ?? link.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (rawName.length < 5 || rawName.length > 120) continue
        if (['home', 'events', 'news', 'contact', 'about'].includes(rawName.toLowerCase())) continue

        // Prefix "IBJJF" if absent so names are consistent with the seed
        const name = /ibjjf/i.test(rawName) ? rawName : `IBJJF ${rawName}`

        const card = link.closest('[class*="card"],[class*="event"],[class*="competition"],article,li,tr')

        // Date — try <time>, then elements with date-like class names
        const timeEl = (card ?? link).querySelector<HTMLElement>('time,[class*="date"],[class*="when"]')
        const dateText = timeEl?.getAttribute('datetime') ?? timeEl?.textContent?.trim().replace(/\s+/g, ' ') ?? null

        // Skip past events if we can parse the date
        if (dateText) {
          try { if (new Date(dateText).toISOString().slice(0, 10) < today) continue } catch {}
        }

        const locEl = card?.querySelector<HTMLElement>('[class*="location"],[class*="city"],[class*="venue"],[class*="country"]')
        const location = locEl?.textContent?.trim().replace(/\s+/g, ' ') ?? null

        results.push({ name, eventId: `ibjjf-${slug}`, url: href, date: dateText, location })
      }
      return results
    }, todayIso)

    return events
  } catch {
    return []
  } finally {
    await browser.close()
  }
}

// Scrape ajptour.com for upcoming competitions (Grand Slams, Tours, Opens).
// Covers regional events (Estonia, Germany, etc.) not in the manual seed.
// Selectors are best-effort — AJP may update their site structure.
export async function scrapeAjpEvents(): Promise<ScrapedEvent[]> {
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)

    for (const url of [
      'https://ajptour.com/en/competitions',
      'https://ajptour.com/en/events',
      'https://ajptour.com/en/calendar',
    ]) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(3000)
        // Consider loaded if there are any link or card elements on the page
        const hasLinks = await page.$('a[href]').catch(() => null)
        if (hasLinks) break
      } catch { /* try next */ }
    }

    const todayIso = new Date().toISOString().slice(0, 10)

    const events = await page.evaluate((today: string) => {
      const results: Array<{ name: string; eventId: string; url: string; date: string | null; location: string | null }> = []
      const seen = new Set<string>()

      const links = document.querySelectorAll<HTMLAnchorElement>('a[href]')
      for (const link of Array.from(links)) {
        const href = link.href
        // AJP competition URL patterns: /competition/xxx, /competitions/xxx, /event/xxx
        const slugM = href.match(/\/(?:competition|competitions|event)s?\/([a-z0-9][a-z0-9-]+)(?:[/?#]|$)/)
        if (!slugM) continue
        const slug = slugM[1]
        if (['list', 'all', 'upcoming', 'past', 'results'].includes(slug)) continue
        if (seen.has(slug)) continue
        seen.add(slug)

        const nameEl = link.querySelector('h1,h2,h3,h4,[class*="title"],[class*="name"]')
        const rawName = (nameEl?.textContent ?? link.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (rawName.length < 4 || rawName.length > 120) continue

        const name = /ajp/i.test(rawName) ? rawName : `AJP ${rawName}`

        const card = link.closest('[class*="card"],[class*="competition"],[class*="event"],article,li')

        const timeEl = (card ?? link).querySelector<HTMLElement>('time,[class*="date"],[class*="when"]')
        const dateText = timeEl?.getAttribute('datetime') ?? timeEl?.textContent?.trim().replace(/\s+/g, ' ') ?? null

        if (dateText) {
          try { if (new Date(dateText).toISOString().slice(0, 10) < today) continue } catch {}
        }

        const locEl = card?.querySelector<HTMLElement>('[class*="location"],[class*="city"],[class*="country"],[class*="venue"]')
        const location = locEl?.textContent?.trim().replace(/\s+/g, ' ') ?? null

        results.push({ name, eventId: `ajp-${slug}`, url: href, date: dateText, location })
      }
      return results
    }, todayIso)

    return events
  } catch {
    return []
  } finally {
    await browser.close()
  }
}

// Scrape the Smoothcomp competitions list for upcoming BJJ events.
// Only returns events with a date in the future — past events are excluded.
export async function scrapeUpcomingCompetitions(discipline = 'jiu-jitsu'): Promise<Array<{
  name: string
  eventId: string
  url: string
  date: string | null
  location: string | null
}>> {
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    // Force discipline to jiu-jitsu — we never want MMA/wrestling bleed-through
    await page.goto(`${SC_BASE}/en/competitions?sport=${encodeURIComponent('jiu-jitsu')}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(3000)

    const todayIso = new Date().toISOString().slice(0, 10)

    const events = await page.evaluate((today: string) => {
      const results: Array<{ name: string; eventId: string; url: string; date: string | null; location: string | null }> = []
      const links = document.querySelectorAll('a[href*="/event/"]')
      const seen = new Set<string>()

      for (const link of Array.from(links)) {
        const href = (link as HTMLAnchorElement).href
        const idMatch = href.match(/\/event\/(\d+)/)
        if (!idMatch) continue
        const eventId = idMatch[1]
        if (seen.has(eventId)) continue
        seen.add(eventId)

        const name = link.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim()
          ?? link.textContent?.trim()
          ?? ''
        if (name.length < 2) continue

        const card = link.closest('[class*="event"], [class*="competition"], article, li')
        const dateText = card?.querySelector('[class*="date"], time')?.textContent?.trim() ?? null
        const locationText = card?.querySelector('[class*="location"], [class*="venue"]')?.textContent?.trim() ?? null

        // Drop past events — if we can parse a date and it's before today, skip it
        if (dateText) {
          try {
            const parsed = new Date(dateText)
            if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) < today) continue
          } catch { /* unparseable date — include it */ }
        }

        results.push({ name, eventId, url: href, date: dateText, location: locationText })
      }
      return results
    }, todayIso)

    return events
  } finally {
    await browser.close()
  }
}
