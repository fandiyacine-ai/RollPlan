import { chromium as playwrightChromium, type Browser, type Page } from 'playwright'
// playwright-extra + stealth plugin for Cloudflare-protected pages (athlete profiles)
import { chromium as stealthChromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import type {
  ScBracketResult,
  ScAthleteRef,
  ScBracketMatch,
  ScAthleteProfile,
  ScPastCompetition,
  ScEventStreams,
} from './types'

const SC_BASE = 'https://smoothcomp.com'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Wait for Firebase-loaded content by checking that the loading spinner is gone
// and at least one real content element is present
async function waitForFirebase(page: Page, selector: string, timeout = 15000) {
  await page.waitForSelector(selector, { timeout })
}

// Suppress unused warning — waitForFirebase is kept for future use
void waitForFirebase

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
]

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function launchBrowser(): Promise<Browser> {
  return playwrightChromium.launch({ headless: true, args: BROWSER_ARGS })
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

// Stealth browser: uses playwright-extra + stealth plugin to pass Cloudflare's
// bot detection (Managed Challenge) on profile pages.
async function launchStealthBrowser(): Promise<Browser> {
  stealthChromium.use(StealthPlugin())
  return stealthChromium.launch({ headless: true, args: BROWSER_ARGS }) as Promise<Browser>
}

async function newStealthPage(browser: Browser) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
    },
  })
  return ctx.newPage()
}

type GeminiCompetition = { eventName: string; eventId: string; eventUrl: string; date: string | null; placement: string | null }

async function callGeminiExtract(parts: Array<Record<string, unknown>>): Promise<GeminiCompetition[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return []
  try {
    const resp = await fetch(
      `${GEMINI_BASE}/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(30000),
      }
    )
    if (!resp.ok) return []
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const parsed = JSON.parse(text) as { competitions?: GeminiCompetition[] }
    return parsed.competitions ?? []
  } catch {
    return []
  }
}

const EXTRACT_PROMPT = `Extract all competition events listed on this athlete profile page (Smoothcomp / AJP Tour).
For each event return:
- eventName: full tournament name
- eventId: numeric ID from any /event/12345 URL (just the number, or empty string)
- eventUrl: full event URL if visible, or empty string
- date: YYYY-MM-DD if visible, or null
- placement: result if visible ("1st", "gold", etc.), or null
Return JSON: { "competitions": [...] }. Only valid JSON, no markdown.`

// Extract from a screenshot (fallback when ZenRows not configured)
async function extractCompetitionsFromScreenshot(screenshotBuffer: Buffer): Promise<GeminiCompetition[]> {
  return callGeminiExtract([
    { inlineData: { mimeType: 'image/png', data: screenshotBuffer.toString('base64') } },
    { text: EXTRACT_PROMPT },
  ])
}

// Extract from rendered HTML (used with ZenRows)
async function extractCompetitionsFromHtml(html: string): Promise<GeminiCompetition[]> {
  const truncated = html.length > 80000 ? html.slice(0, 80000) : html
  return callGeminiExtract([{ text: `${EXTRACT_PROMPT}\n\nHTML:\n${truncated}` }])
}

// ZenRows: bypasses Cloudflare Managed Challenge using residential IPs.
// Renders the page with a real browser, returns HTML.
async function scrapeViaZenRows(profileUrl: string): Promise<{
  isPublic: boolean; name: string; competitions: IntelCompetition[]
} | null> {
  const key = process.env.ZENROWS_API_KEY
  if (!key) return null

  try {
    const params = new URLSearchParams({
      apikey: key,
      url: profileUrl,
      js_render: 'true',
      wait: '5000',
    })
    const resp = await fetch(`https://api.zenrows.com/v1/?${params}`, {
      signal: AbortSignal.timeout(60000),
    })
    if (!resp.ok) return null

    const html = await resp.text()
    const lower = html.toLowerCase()
    if (lower.includes('just a moment') || lower.includes('checking your browser')) {
      return { isPublic: false, name: '', competitions: [] }
    }
    if (lower.includes('private profile') || lower.includes('profile is private')) {
      return { isPublic: false, name: '', competitions: [] }
    }

    const competitions = await extractCompetitionsFromHtml(html)

    // Simple name extraction from h1/h2/h3
    const nameMatch = html.match(/<h[123][^>]*>([^<]{3,60})<\/h[123]>/i)
    const name = nameMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? ''

    return { isPublic: true, name, competitions }
  } catch {
    return null
  }
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

  // Use stealth browser to bypass Cloudflare Managed Challenge on profile pages
  const browser = await launchStealthBrowser()
  try {
    const page = await newStealthPage(browser)
    await page.goto(profileUrl, { waitUntil: 'load', timeout: 40000 })
    // Give Firebase and any CF challenge time to resolve
    await page.waitForTimeout(6000)

    // Take a full-page screenshot for vision-based extraction (robust against layout changes)
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' }).catch(() => null)

    const bodyText = await page.evaluate(() => document.body.textContent?.toLowerCase() ?? '')
    const isCloudflareChallenge =
      bodyText.includes('just a moment') ||
      bodyText.includes('security verification') ||
      bodyText.includes('checking your browser') ||
      bodyText.includes('ddos-guard')

    if (isCloudflareChallenge) {
      // Stealth couldn't bypass CF — mark as blocked, retry will be scheduled
      return { athleteId, name: '', isPublic: false, pastCompetitions: [], photoUrl: null }
    }

    const isPrivate =
      bodyText.includes('private profile') ||
      bodyText.includes('profile is private') ||
      bodyText.includes('hidden profile') ||
      (await page.$('[class*="private"]').catch(() => null)) !== null

    if (isPrivate) {
      return { athleteId, name: '', isPublic: false, pastCompetitions: [], photoUrl: null }
    }

    // Extract athlete name from DOM
    const name = await page.evaluate(() => {
      for (const h of Array.from(document.querySelectorAll('h1, h2, h3'))) {
        const t = h.textContent?.trim() ?? ''
        if (t.length > 3 && t.length < 60 && !t.toLowerCase().includes('smoothcomp') && !t.toLowerCase().includes('log in')) {
          return t
        }
      }
      return ''
    })

    const photoUrl = await page.evaluate(() => {
      for (const img of Array.from(document.querySelectorAll('img'))) {
        const src = (img as HTMLImageElement).src
        if (src.includes('profile') || src.includes('avatar') || src.includes('pictures/p/')) return src
      }
      return null
    })

    // Strategy 1: vision-based extraction via Gemini (handles Firebase lazy-loaded content)
    let comps: Array<{ eventName: string; eventId: string; eventUrl: string; date: string | null; placement: string | null }> = []
    if (screenshot) {
      comps = await extractCompetitionsFromScreenshot(screenshot)
    }

    // Strategy 2: DOM link extraction as supplement (catches event links missed by vision)
    const domComps = await page.evaluate(() => {
      const results: Array<{ eventName: string; eventId: string; eventUrl: string; date: string | null; placement: string | null }> = []
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
        results.push({ eventName, eventId, eventUrl: href, date: dateM?.[0] ?? null, placement: placM?.[0] ?? null })
      })
      return results
    })

    // Merge: DOM-found event IDs take precedence (have real URLs), vision fills in the rest
    const seenIds = new Set(domComps.map(c => c.eventId))
    for (const c of comps) {
      if (!c.eventId || seenIds.has(c.eventId)) continue
      seenIds.add(c.eventId)
      domComps.push(c)
    }
    const mergedComps = domComps.length > 0 ? domComps : comps

    // For each past competition, try to find a YouTube recording
    const pastCompetitions: ScPastCompetition[] = []
    for (const comp of mergedComps.slice(0, 5)) {
      const youtubeUrl = await findEventYouTubeStream(comp.eventId).catch(() => null)
      pastCompetitions.push({ ...comp, youtubeUrl })
    }

    return { athleteId, name, isPublic: true, pastCompetitions, photoUrl }
  } finally {
    await browser.close()
  }
}

export type IntelCompetition = {
  eventName: string
  eventId: string
  eventUrl: string
  date: string | null
  placement: string | null
}

// Stealth + vision profile scrape for the scout agent.
// Returns all competitions (no YouTube check, no 5-event limit).
// Used by scout-opponent-agent, not by the footage discovery pipeline.
export async function scrapeProfileForIntel(profileUrl: string): Promise<{
  isPublic: boolean
  athleteId: string
  name: string
  competitions: IntelCompetition[]
}> {
  const athleteIdMatch = profileUrl.match(/\/profile\/(\d+)/)
  const athleteId = athleteIdMatch?.[1] ?? ''

  // ZenRows: residential proxy bypasses Cloudflare. Use when ZENROWS_API_KEY is set.
  const zenrows = await scrapeViaZenRows(profileUrl)
  if (zenrows !== null) {
    return { isPublic: zenrows.isPublic, athleteId, name: zenrows.name, competitions: zenrows.competitions }
  }

  // Fallback: stealth browser (works for non-Cloudflare pages)
  const browser = await launchStealthBrowser()
  try {
    const page = await newStealthPage(browser)
    await page.goto(profileUrl, { waitUntil: 'load', timeout: 40000 })
    await page.waitForTimeout(6000)

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' }).catch(() => null)

    const bodyText = await page.evaluate(() => document.body.textContent?.toLowerCase() ?? '')
    const isCloudflareChallenge =
      bodyText.includes('just a moment') ||
      bodyText.includes('security verification') ||
      bodyText.includes('checking your browser')

    if (isCloudflareChallenge) {
      return { isPublic: false, athleteId, name: '', competitions: [] }
    }

    const isPrivate =
      bodyText.includes('private profile') ||
      bodyText.includes('profile is private')

    if (isPrivate) {
      return { isPublic: false, athleteId, name: '', competitions: [] }
    }

    const name = await page.evaluate(() => {
      for (const h of Array.from(document.querySelectorAll('h1, h2, h3'))) {
        const t = h.textContent?.trim() ?? ''
        if (t.length > 3 && t.length < 60 && !t.toLowerCase().includes('smoothcomp') && !t.toLowerCase().includes('ajp tour') && !t.toLowerCase().includes('log in')) {
          return t
        }
      }
      return ''
    })

    // DOM-based extraction
    const domComps: IntelCompetition[] = await page.evaluate(() => {
      const results: Array<{ eventName: string; eventId: string; eventUrl: string; date: string | null; placement: string | null }> = []
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
        const row = el.closest('tr, li, [class*="competition"], [class*="result"], [class*="event"]')
        const ctx = row?.textContent ?? ''
        const dateM = ctx.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[.\/ ]\w+[.\/ ]\d{4}/)
        const placM = ctx.match(/\b(1st|2nd|3rd|\d+th|gold|silver|bronze)\b/i)
        results.push({ eventName, eventId, eventUrl: href, date: dateM?.[0] ?? null, placement: placM?.[0] ?? null })
      })
      return results
    })

    // Vision-based extraction as supplement
    let visionComps: IntelCompetition[] = []
    if (screenshot) {
      visionComps = await extractCompetitionsFromScreenshot(screenshot)
    }

    // Merge DOM (primary) + vision (supplement)
    const seenIds = new Set(domComps.map(c => c.eventId))
    for (const c of visionComps) {
      if (!c.eventId || seenIds.has(c.eventId)) continue
      seenIds.add(c.eventId)
      domComps.push(c)
    }

    return { isPublic: true, athleteId, name, competitions: domComps.length > 0 ? domComps : visionComps }
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

// Fetch IBJJF events from their internal JSON API — no browser needed.
// The endpoint requires Referer + X-Requested-With headers to return data.
export async function scrapeIbjjfEvents(): Promise<ScrapedEvent[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const currentYear = new Date().getFullYear()

    const resp = await fetch('https://ibjjf.com/api/v1/events/calendar.json', {
      headers: {
        'Referer': 'https://ibjjf.com/events/calendar',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
      },
    })
    if (!resp.ok) return []

    const data = await resp.json() as { infosite_events?: Array<{
      id: number; name: string; status: string
      startDay: number; month: string; year: number
      local: string; city: string; pageUrl: string | null
    }> }
    const raw = data.infosite_events ?? []

    const results: ScrapedEvent[] = []
    for (const ev of raw) {
      if (ev.status === 'finished' || ev.year < currentYear) continue

      let eventDate: string | null = null
      try {
        const d = new Date(`${ev.month} ${ev.startDay} ${ev.year}`)
        if (!isNaN(d.getTime())) eventDate = d.toISOString().slice(0, 10)
      } catch { /* skip */ }

      if (eventDate && eventDate < today) continue

      const name = /ibjjf/i.test(ev.name) ? ev.name : `IBJJF ${ev.name}`
      const location = [ev.local, ev.city].filter(Boolean).join(', ') || null
      const url = ev.pageUrl ? `https://ibjjf.com${ev.pageUrl}` : 'https://ibjjf.com/events/calendar'

      results.push({ name, eventId: `ibjjf-${ev.id}`, url, date: eventDate, location })
    }
    return results
  } catch {
    return []
  }
}

// Scrape ajptour.com for upcoming competitions.
// ajptour.com uses the same Smoothcomp-powered event card structure as smoothcomp.com.
export async function scrapeAjpEvents(): Promise<ScrapedEvent[]> {
  const browser = await launchBrowser()
  try {
    const page = await newPage(browser)
    await page.goto('https://ajptour.com/en/events/upcoming', { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(5000)

    const todayIso = new Date().toISOString().slice(0, 10)
    const currentYear = new Date().getFullYear()

    const events = await page.evaluate((args: { today: string; year: number }) => {
      const { today, year } = args
      const results: Array<{ name: string; eventId: string; url: string; date: string | null; location: string | null }> = []
      const seen = new Set<string>()

      const cards = document.querySelectorAll('.event-card')
      for (const card of Array.from(cards)) {
        const titleLink = card.querySelector<HTMLAnchorElement>('h3 a, a.event-title')
        if (!titleLink) continue
        const href = titleLink.href
        const idMatch = href.match(/\/event\/(\d+)/)
        if (!idMatch) continue
        const eventId = idMatch[1]
        if (seen.has(eventId)) continue
        seen.add(eventId)

        const rawName = (titleLink.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (rawName.length < 4) continue

        const name = /ajp/i.test(rawName) ? rawName : `AJP ${rawName}`

        const locEl = card.querySelector('.location')
        const location = locEl ? (locEl.textContent ?? '').trim().replace(/\s+/g, ' ') : null

        // Date rendered as "May 31" — infer year
        const dateEl = card.querySelector('.date')
        const dateText = dateEl ? (dateEl.textContent ?? '').trim() : null
        let eventDate: string | null = null
        if (dateText) {
          const d = new Date(`${dateText} ${year}`)
          if (!isNaN(d.getTime())) {
            const iso = d.toISOString().slice(0, 10)
            if (iso < today) {
              const d2 = new Date(`${dateText} ${year + 1}`)
              eventDate = isNaN(d2.getTime()) ? null : d2.toISOString().slice(0, 10)
            } else {
              eventDate = iso
            }
          }
        }
        if (eventDate && eventDate < today) continue

        results.push({ name, eventId: `ajp-${eventId}`, url: href, date: eventDate, location })
      }
      return results
    }, { today: todayIso, year: currentYear })

    return events
  } catch {
    return []
  } finally {
    await browser.close()
  }
}

// Scrape the Smoothcomp event calendar for upcoming BJJ/grappling events.
// URL changed from /en/competitions to /en/events/upcoming in 2026.
export async function scrapeUpcomingCompetitions(_discipline = 'jiu-jitsu'): Promise<Array<{
  name: string
  eventId: string
  url: string
  date: string | null
  location: string | null
}>> {
  const browser = await launchBrowser()
  try {
    const page = await newStealthPage(browser)
    await page.goto(`${SC_BASE}/en/events/upcoming`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(5000)

    const todayIso = new Date().toISOString().slice(0, 10)
    const currentYear = new Date().getFullYear()

    const events = await page.evaluate((args: { today: string; year: number }) => {
      const { today, year } = args
      const results: Array<{ name: string; eventId: string; url: string; date: string | null; location: string | null }> = []
      const seen = new Set<string>()

      const cards = document.querySelectorAll('.event-card')
      for (const card of Array.from(cards)) {
        const titleLink = card.querySelector<HTMLAnchorElement>('h3 a, a.event-title')
        if (!titleLink) continue
        const href = titleLink.href
        const idMatch = href.match(/\/event\/(\d+)/)
        if (!idMatch) continue
        const eventId = idMatch[1]
        if (seen.has(eventId)) continue
        seen.add(eventId)

        const name = (titleLink.textContent ?? '').trim().replace(/\s+/g, ' ')
        if (name.length < 4) continue
        // Only BJJ / grappling events
        if (!/jiu.?jitsu|bjj|grappling/i.test(name + (card.textContent ?? ''))) continue

        const locEl = card.querySelector('.location')
        const location = locEl ? (locEl.textContent ?? '').trim().replace(/\s+/g, ' ') : null

        // Date rendered as "May 23" — infer year from current year, falling back to next year
        const dateEl = card.querySelector('.date')
        const dateText = dateEl ? (dateEl.textContent ?? '').trim() : null
        let eventDate: string | null = null
        if (dateText) {
          const d = new Date(`${dateText} ${year}`)
          if (!isNaN(d.getTime())) {
            const iso = d.toISOString().slice(0, 10)
            if (iso < today) {
              const d2 = new Date(`${dateText} ${year + 1}`)
              eventDate = isNaN(d2.getTime()) ? null : d2.toISOString().slice(0, 10)
            } else {
              eventDate = iso
            }
          }
        }
        if (eventDate && eventDate < today) continue

        results.push({ name, eventId, url: href, date: eventDate, location })
      }
      return results
    }, { today: todayIso, year: currentYear })

    return events
  } finally {
    await browser.close()
  }
}
