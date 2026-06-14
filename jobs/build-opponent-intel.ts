import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { eq, ne, isNotNull, sql } from 'drizzle-orm'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// AJP/Smoothcomp's paginated event-history endpoints sit behind Cloudflare and start
// returning 429s mid-pagination when hit back-to-back; spacing requests out avoids that.
const PAGINATION_DELAY_MS = 3000

// AJP/Smoothcomp exposes a public JSON API for athlete event history — no auth, no proxy needed.
// GET https://ajptour.com/en/profile/{athleteId}/events?page={n}
// Returns paginated competition history with match-level detail.
//
// For manually-added opponents without an athlete ID, we:
// 1. Google search "{name} BJJ site:ajptour.com" to find AJP event URLs
// 2. Extract event IDs from those URLs
// 3. POST /en/event/{id}/participants (no auth needed) to find the athlete by name → get user_id
// 4. Use user_id as smoothcompAthleteId going forward

type AjpMatch = {
  match: { id: number; state: string; video_exists: boolean }
  is_winner: boolean
  opponents: Array<{ id: number; name: string }>
  outcome: string
}

type AjpRegistration = {
  id: number
  bracket_id: number | null
  group: string
  matches: AjpMatch[]
  placement: number | null
  published: boolean
}

type AjpEvent = {
  info: { id: number; title: string; event_start: number }
  upcomingEvent: boolean
  registrations: AjpRegistration[]
}

export type AjpEventsPage = {
  current_page: number
  last_page: number
  data: AjpEvent[]
}

// Strip diacritics for comparison: "Mäki" → "Maki", "João" → "Joao".
// Athletes often register on platforms without accents even if their legal name has them.
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Middle names are optional: first+last must match, middle is bonus.
export function nameMatchThreshold(parts: string[]): number {
  if (parts.length <= 2) return parts.length
  if (parts.length === 3) return 2  // middle name optional
  return Math.ceil(parts.length * 2 / 3)
}

// Career medal counts (career totals, not finals-only W/L) embedded as JSON-LD
// in the bjjmetrics fighter page — used as a fallback when jiujitsu.net has no medals.
export async function fetchBjjmetricsMedalCounts(slug: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://bjjmetrics.com/fighter/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12000),
    })
    if (!resp.ok) return null
    const html = await resp.text()
    const gold = html.match(/"name":\s*"Gold Medals",\s*"value":\s*(\d+)/)?.[1]
    const silver = html.match(/"name":\s*"Silver Medals",\s*"value":\s*(\d+)/)?.[1]
    const bronze = html.match(/"name":\s*"Bronze Medals",\s*"value":\s*(\d+)/)?.[1]
    if (gold == null && silver == null && bronze == null) return null
    const g = Number(gold ?? 0), s = Number(silver ?? 0), b = Number(bronze ?? 0)
    if (g + s + b === 0) return null
    return `🥇${g} 🥈${s} 🥉${b}`
  } catch { return null }
}

// Extract AJP profile ID from any URL found in search results
function extractAjpProfileId(urls: string[]): string | null {
  for (const url of urls) {
    const m = url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
    if (m) return m[1]
  }
  return null
}

// Verify an AJP profile ID belongs to the expected athlete by:
// 1. Confirming events exist
// 2. Looking up the athlete's name from their first event's participants list
async function verifyAjpProfileName(athleteId: string, expectedName: string, fallbackEventIds: string[] = []): Promise<boolean> {
  try {
    let eventId: string | null = null
    try {
      const page = await fetchAjpEventsPage(athleteId, 1)
      if (!page.data?.length) return false
      const firstEvent = page.data.find(ev => !ev.upcomingEvent)
      if (firstEvent) eventId = String(firstEvent.info.id)
    } catch {
      // 403 on profile events API — use caller-supplied event IDs as fallback
      eventId = fallbackEventIds[0] ?? null
    }
    if (!eventId) return false

    const pResp = await fetch(`https://ajptour.com/en/event/${eventId}/participants`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!pResp.ok) return false

    const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
    const normExpected = normalizeName(expectedName)
    const nameParts = normExpected.split(/\s+/).filter(p => p.length > 1)
    const threshold = nameMatchThreshold(nameParts)

    for (const participant of pData.participants ?? []) {
      for (const reg of participant.registrations ?? []) {
        if (String(reg.user_id) !== athleteId) continue
        const fullName = normalizeName(`${reg.firstname} ${reg.lastname}`)
        const matchCount = nameParts.filter(p => fullName.includes(p)).length
        if (matchCount >= threshold) return true
      }
    }
    return false
  } catch { return false }
}

// Use Gemini with Google Search grounding to find a profile URL.
// Gemini grounds its answer with real Google search results; the grounding chunks
// include redirect URLs we can follow to get the actual profile page URL.
async function geminiGroundedSearch(query: string, domain: string): Promise<string[]> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) return []
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: query }] }],
          tools: [{ google_search: {} }],
        }),
        signal: AbortSignal.timeout(20000),
      }
    )
    if (!resp.ok) return []
    const data = await resp.json() as {
      candidates?: Array<{
        groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
      }>
    }
    const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
    const redirectUrls = chunks
      .map(c => c.web?.uri)
      .filter((u): u is string => !!u && u.includes('grounding-api-redirect'))

    // Follow each redirect to get the real URL
    const realUrls: string[] = []
    for (const redirectUrl of redirectUrls) {
      try {
        const r = await fetch(redirectUrl, {
          method: 'HEAD',
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        })
        const location = r.headers.get('location')
        if (location && location.includes(domain)) realUrls.push(location)
      } catch { continue }
    }
    return realUrls
  } catch { return [] }
}

// Multi-engine search for AJP athlete profile — direct AJP search → Brave → Gemini+Google
// Profile URL gives the athlete ID directly; event URL triggers participants POST fallback.
export async function findAjpAthleteIdByName(name: string): Promise<string | null> {
  // 0. Direct AJP athlete directory search — most reliable, doesn't depend on search engine indexing.
  // ajptour.com uses the same Firebase/Smoothcomp platform so the /en/user?search page works identically.
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
    try {
      const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'en-US',
      })
      const page = await ctx.newPage()
      await page.goto(`https://ajptour.com/en/user?search=${encodeURIComponent(name)}`, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      const profileLinks = await page.evaluate(() => {
        const links: string[] = []
        document.querySelectorAll('a[href*="/profile/"]').forEach(el => {
          const href = (el as HTMLAnchorElement).href
          if (/ajptour\.com\/[a-z]+\/profile\/\d+/.test(href)) links.push(href)
        })
        return [...new Set(links)]
      })
      for (const url of profileLinks) {
        const m = url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
        if (m && await verifyAjpProfileName(m[1], name)) return m[1]
      }
    } finally {
      await browser.close()
    }
  } catch { /* Playwright unavailable or page load failed — fall through to search engines */ }

  // 1. Brave Search API (JSON, no bot issues — but AJP not always indexed)
  // Collect URLs across all query variants — same logic as findSmoothcompProfiles
  const apiKey = process.env.BRAVE_API_KEY
  let allAjpUrls: string[] = []
  if (apiKey) {
    const seen = new Set<string>()
    for (const query of nameSearchQueries(name, 'ajptour.com')) {
      try {
        const resp = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
          { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
        )
        if (!resp.ok) continue
        const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
        for (const r of data.web?.results ?? []) {
          if (!seen.has(r.url)) { seen.add(r.url); allAjpUrls.push(r.url) }
        }
      } catch { continue }
    }
    const braveEventIds = [...new Set(allAjpUrls.map(u => u.match(/ajptour\.com\/[a-z]{0,10}\/?event\/(\d+)/)?.[1]).filter(Boolean) as string[])]
    for (const url of allAjpUrls) {
      const m = url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
      if (m && await verifyAjpProfileName(m[1], name, braveEventIds)) return m[1]
    }
    if (braveEventIds.length > 0) {
      const found = await findIdFromEventParticipants(braveEventIds, name)
      if (found) return found
    }
  }

  // 2. Gemini + Google Search grounding (real Google results, no bot-blocking)
  const geminiUrls = await geminiGroundedSearch(
    `Search for the exact ajptour.com profile page of BJJ athlete named "${name}". I need the direct URL like https://ajptour.com/en/profile/NUMBERS. Only return URLs that contain the athlete's exact name.`,
    'ajptour.com'
  )
  if (geminiUrls.length > 0) {
    const geminiEventIds = [...new Set(geminiUrls.map(u => u.match(/ajptour\.com\/[a-z]{0,10}\/?event\/(\d+)/)?.[1]).filter(Boolean) as string[])]
    for (const url of geminiUrls) {
      const m = url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
      if (m) {
        const isRight = await verifyAjpProfileName(m[1], name, geminiEventIds)
        if (isRight) return m[1]
      }
    }
    if (geminiEventIds.length > 0) {
      const found = await findIdFromEventParticipants(geminiEventIds, name)
      if (found) return found
    }
  }

  return null
}

async function findIdFromEventParticipants(eventIds: string[], name: string): Promise<string | null> {
  const normName = normalizeName(name)
  const nameParts = normName.split(/\s+/).filter(p => p.length > 1)
  const threshold = nameMatchThreshold(nameParts)
  for (const eventId of eventIds.slice(0, 5)) {
    try {
      const pResp = await fetch(`https://ajptour.com/en/event/${eventId}/participants`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      })
      if (!pResp.ok) continue
      const data = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
      for (const participant of data.participants ?? []) {
        for (const reg of participant.registrations ?? []) {
          const fullName = normalizeName(`${reg.firstname} ${reg.lastname}`)
          const matchCount = nameParts.filter(p => fullName.includes(p)).length
          if (matchCount >= threshold) return String(reg.user_id)
        }
      }
    } catch { continue }
  }
  return null
}

// Extract smoothcomp.com profile entries — main domain only, no federation subdomains
function extractSmoothcompProfiles(urls: string[]): Array<{ baseUrl: string; athleteId: string }> {
  const profiles: Array<{ baseUrl: string; athleteId: string }> = []
  for (const url of urls) {
    const m = url.match(/^https?:\/\/smoothcomp\.com\/[a-z]{0,5}\/profile\/(\d+)/)
    if (m) profiles.push({ baseUrl: 'https://smoothcomp.com', athleteId: m[1] })
  }
  return profiles
}

// Fuzzy name check: exact substring match first, then last-name-exact + first-name-prefix.
// Handles spelling variants like "Zakriya" vs "Zakariya" (same first 3 chars, same last name).
function nameMatchesFuzzy(fullName: string, nameParts: string[], threshold: number): boolean {
  const normFull = normalizeName(fullName)
  const normParts = nameParts.map(normalizeName)
  const matchCount = normParts.filter(p => normFull.includes(p)).length
  if (matchCount >= threshold) return true
  if (normParts.length < 2) return false
  const lastName = normParts[normParts.length - 1]
  const firstName = normParts[0]
  const profileWords = normFull.split(/\s+/)
  const lastNameMatch = profileWords.includes(lastName)
  const firstPrefix = firstName.slice(0, 3)
  const firstNameFuzzy = firstName.length >= 5 && profileWords.some(w => w.length >= 5 && w.startsWith(firstPrefix))
  return lastNameMatch && firstNameFuzzy
}

// Same identity verification as verifyAjpProfileName but for Smoothcomp (main domain only)
// Returns 'public' (name verified via event participants), 'private' (no events but trusted from search),
// or 'rejected' (name mismatch or error).
async function checkSmoothcompProfile(athleteId: string, expectedName: string, trustIfEmpty: boolean): Promise<'public' | 'private' | 'rejected'> {
  const baseUrl = 'https://smoothcomp.com'
  try {
    const page = await fetchSmoothcompEventsPage(baseUrl, athleteId, 1)
    if (!page.data?.length) {
      return trustIfEmpty ? 'private' : 'rejected'
    }
    const firstEvent = page.data.find(ev => !ev.upcomingEvent)
    if (!firstEvent) return trustIfEmpty ? 'private' : 'rejected'
    const pResp = await fetch(`${baseUrl}/en/event/${firstEvent.info.id}/participants`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!pResp.ok) return 'rejected'
    const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
    const normExpected = normalizeName(expectedName)
    const nameParts = normExpected.split(/\s+/).filter(p => p.length > 1)
    const threshold = nameMatchThreshold(nameParts)
    for (const participant of pData.participants ?? []) {
      for (const reg of participant.registrations ?? []) {
        if (String(reg.user_id) !== athleteId) continue
        const fullName = normalizeName(`${reg.firstname} ${reg.lastname}`)
        if (nameMatchesFuzzy(fullName, nameParts, threshold)) return 'public'
      }
    }
    return 'rejected'
  } catch { return 'rejected' }
}

export async function verifySmoothcompProfileName(athleteId: string, expectedName: string, trustIfEmpty = false): Promise<boolean> {
  const result = await checkSmoothcompProfile(athleteId, expectedName, trustIfEmpty)
  return result !== 'rejected'
}


// Build search query variants from most to least specific.
// Handles spelling mismatches (e.g. "Zakriya" stored vs "Zakariya" registered)
// by also trying first+last only and last-name-only queries.
function nameSearchQueries(name: string, domain: string): string[] {
  const parts = name.trim().split(/\s+/)
  const queries = [`"${name}" site:${domain}`, `${name} site:${domain}`]

  // If the name has diacritics (ä, ö, ü, etc.), also search without them —
  // athletes often register on platforms using the ASCII version of their name.
  const normalizedName = parts.map(p => {
    const n = normalizeName(p)
    return n.charAt(0).toUpperCase() + n.slice(1)
  }).join(' ')
  if (normalizedName !== name) {
    queries.push(`"${normalizedName}" site:${domain}`, `${normalizedName} site:${domain}`)
  }

  if (parts.length >= 3) {
    const firstLast = `${parts[0]} ${parts[parts.length - 1]}`
    queries.push(`"${firstLast}" site:${domain}`, `${firstLast} site:${domain}`)
    // Middle + last name: bypasses first-name spelling variants (e.g. "Zakriya" vs "Zakariya")
    // while still uniquely identifying the person.
    const middleLast = `${parts[1]} ${parts[parts.length - 1]}`
    queries.push(`${middleLast} site:${domain}`)
  }
  if (parts.length >= 2) {
    queries.push(`${parts[parts.length - 1]} site:${domain}`)
  }
  return queries
}

// Multi-engine search for Smoothcomp profiles — Brave → Gemini
// Only searches smoothcomp.com (main domain)
export async function findSmoothcompProfiles(name: string): Promise<Array<{ baseUrl: string; athleteId: string }>> {
  // Track which URLs were found by "strong" queries (containing the athlete's first name).
  // Private profiles are only trusted as a last resort if found by a strong query —
  // last-name-only queries can match ghost profiles or unrelated athletes.
  const firstName = name.trim().split(/\s+/)[0].toLowerCase()
  const strongQueryUrls = new Set<string>()
  let candidateUrls: string[] = []

  // 0. Direct Smoothcomp athlete search — most reliable, doesn't depend on search engine indexing.
  // smoothcomp.com/en/user?search={name} is Firebase-rendered; use a headless browser.
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
    try {
      const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', locale: 'en-US' })
      const page = await ctx.newPage()
      await page.goto(`https://smoothcomp.com/en/user?search=${encodeURIComponent(name)}`, { waitUntil: 'load', timeout: 30000 })
      await page.waitForTimeout(3000)
      const profileLinks = await page.evaluate(() => {
        const links: string[] = []
        document.querySelectorAll('a[href*="/profile/"]').forEach(el => {
          const href = (el as HTMLAnchorElement).href
          if (/smoothcomp\.com\/[a-z]+\/profile\/\d+/.test(href)) links.push(href)
        })
        return [...new Set(links)]
      })
      for (const url of profileLinks) {
        if (!candidateUrls.includes(url)) {
          candidateUrls.push(url)
          strongQueryUrls.add(url)  // Direct search result — treat as strong
        }
      }
    } finally {
      await browser.close()
    }
  } catch { /* Playwright unavailable or page load failed — fall through to search engines */ }

  // 1. Brave — run all query variants and collect unique URLs across all of them.
  // Don't stop at first-query results: a shorter/alternate-spelling query may find the profile
  // when the full stored name fails (e.g. "Zakriya" stored vs "Zakariya" registered).
  const apiKey = process.env.BRAVE_API_KEY
  if (apiKey) {
    const seen = new Set<string>()
    for (const query of nameSearchQueries(name, 'smoothcomp.com')) {
      const isStrongQuery = query.toLowerCase().includes(firstName)
      try {
        const resp = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
          { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
        )
        if (!resp.ok) continue
        const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
        for (const url of data.web?.results ?? []) {
          if (url.url.includes('smoothcomp.com') && !seen.has(url.url)) {
            seen.add(url.url)
            candidateUrls.push(url.url)
            if (isStrongQuery) strongQueryUrls.add(url.url)
          }
        }
      } catch { continue }
    }
  }

  // 2. Gemini + Google Search grounding — always run, not just as fallback.
  // Brave may find unrelated event pages and miss the actual profile; Gemini has better recall.
  // Gemini results are treated as strong (they used the athlete's full name in the query).
  const geminiUrls = await geminiGroundedSearch(
    `Find smoothcomp.com pages for BJJ athlete "${name}". Return any direct profile URLs (smoothcomp.com/*/profile/NUMBERS) or bracket/event pages (smoothcomp.com/*/event/NUMBERS/bracket) that mention this athlete.`,
    'smoothcomp.com'
  )
  const seenUrls = new Set(candidateUrls)
  for (const u of geminiUrls) {
    if (!seenUrls.has(u)) { seenUrls.add(u); candidateUrls.push(u) }
    strongQueryUrls.add(u)
  }

  if (candidateUrls.length === 0) return []

  const nameParts = normalizeName(name).split(/\s+/).filter(p => p.length > 1)
  const threshold = nameMatchThreshold(nameParts)

  // Verify all direct profile URLs, preferring a publicly-verified profile over a private one.
  // Private candidates are only accepted when found by a strong query (first name present).
  // Last-name-only search results can match ghost profiles or unrelated athletes with the same surname.
  const directProfiles = extractSmoothcompProfiles(candidateUrls)
  let privateCandidate: string | null = null
  for (const profile of directProfiles) {
    const status = await checkSmoothcompProfile(profile.athleteId, name, true)
    if (status === 'public') return [{ baseUrl: 'https://smoothcomp.com', athleteId: profile.athleteId }]
    if (status === 'private' && !privateCandidate) {
      // Only trust a private profile if the URL that found it came from a strong query (first name present).
      // Check both /en/ and any locale variant since search results may use different locale prefixes.
      const foundByStrong = [...strongQueryUrls].some(u => u.includes(`/profile/${profile.athleteId}`))
      if (foundByStrong) privateCandidate = profile.athleteId
    }
  }

  // Event/bracket fallback: Google/Brave often indexes bracket pages (smoothcomp.com/locale/event/ID/bracket/...)
  // that contain the athlete's name even when their profile URL doesn't appear in results.
  // Extract event IDs from ALL candidate URLs (including bracket URLs) and check participants.
  // This runs even if a private candidate was found — a publicly-verified event match is preferred.
  const eventIds = [...new Set(
    candidateUrls
      .map(u => u.match(/^https?:\/\/smoothcomp\.com\/[^/]+\/event\/(\d+)/)?.[1])
      .filter((id): id is string => !!id)
  )]

  for (const eventId of eventIds) {
    try {
      const pResp = await fetch(`https://smoothcomp.com/en/event/${eventId}/participants`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      })
      if (!pResp.ok) continue
      const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
      for (const participant of pData.participants ?? []) {
        for (const reg of participant.registrations ?? []) {
          const fullName = normalizeName(`${reg.firstname} ${reg.lastname}`)
          if (nameMatchesFuzzy(fullName, nameParts, threshold)) {
            return [{ baseUrl: 'https://smoothcomp.com', athleteId: String(reg.user_id) }]
          }
        }
      }
    } catch { continue }
  }

  // Last resort: a private profile found via a strong name search (first-name match required).
  if (privateCandidate) return [{ baseUrl: 'https://smoothcomp.com', athleteId: privateCandidate }]

  return []
}

export async function fetchSmoothcompEventsPage(baseUrl: string, athleteId: string, page: number): Promise<AjpEventsPage> {
  const resp = await fetch(`${baseUrl}/en/profile/${athleteId}/events?page=${page}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: `${baseUrl}/en/profile/${athleteId}`,
      Origin: baseUrl,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) throw new Error(`Smoothcomp events API ${resp.status} for ${baseUrl} athlete ${athleteId}`)
  return resp.json() as Promise<AjpEventsPage>
}

export async function fetchAjpEventsPage(athleteId: string, page: number): Promise<AjpEventsPage> {
  const resp = await fetch(
    `https://ajptour.com/en/profile/${athleteId}/events?page=${page}`,
    {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: `https://ajptour.com/en/profile/${athleteId}`,
        Origin: 'https://ajptour.com',
      },
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!resp.ok) throw new Error(`AJP events API ${resp.status} for athlete ${athleteId} page ${page}`)
  return resp.json() as Promise<AjpEventsPage>
}

export const buildOpponentIntel = inngest.createFunction(
  {
    id: 'build-opponent-intel',
    name: 'Scout Opponent Agent',
    triggers: [{ event: 'opponent-intel/build.run' }],
    retries: 1,
    rateLimit: { limit: 10, period: '1m' },
    concurrency: [
      // Prevent concurrent runs for the same opponent (dedup / re-run protection)
      { limit: 1, key: 'event.data.opponentId' },
      // Global cap — each run launches Chromium (~300 MB); >3 simultaneous = OOM risk
      { limit: 3 },
    ],
  },
  async ({ event, step }: {
    event: {
      data: {
        opponentId: string
        athleteName: string
        tournamentId: string
        userId: string
      }
    }
    step: any
  }) => {
    const { opponentId, athleteName } = event.data

    await step.run('mark-running', () =>
      db.update(tournamentOpponents)
        .set({ intelStatus: 'running' })
        .where(eq(tournamentOpponents.id, opponentId))
    )

    const opponent = await step.run('load-opponent', () =>
      db.query.tournamentOpponents.findFirst({
        where: eq(tournamentOpponents.id, opponentId),
        columns: { ajpAthleteId: true, ajpProfileUrl: true, smoothcompAthleteId: true, smoothcompProfileUrl: true },
      })
    )

    // ── AJP (ajptour.com) ─────────────────────────────────────────────────────
    // AJP uses its own numeric athlete registry — IDs must never be mixed with Smoothcomp.
    const ajpAthleteId: string | null = await step.run('find-ajp-id', async () => {
      // 1. Already stored on this record
      if (opponent?.ajpAthleteId) return opponent.ajpAthleteId

      // 2. Another opponent record for the same athlete name already has an AJP ID
      const existing = await db
        .select({ id: tournamentOpponents.ajpAthleteId })
        .from(tournamentOpponents)
        .where(sql`lower(${tournamentOpponents.opponentLabel}) = lower(${athleteName})
          AND ${tournamentOpponents.id} != ${opponentId}
          AND ${tournamentOpponents.ajpAthleteId} IS NOT NULL`)
        .limit(1)
        .then(r => r[0]?.id ?? null)
      if (existing) {
        await db.update(tournamentOpponents)
          .set({ ajpAthleteId: existing, ajpProfileUrl: `https://ajptour.com/en/profile/${existing}` })
          .where(eq(tournamentOpponents.id, opponentId))
        return existing
      }

      // 3. Web search (Brave + Gemini grounded)
      const ajpId = await findAjpAthleteIdByName(athleteName)
      if (ajpId) {
        await db.update(tournamentOpponents)
          .set({ ajpAthleteId: ajpId, ajpProfileUrl: `https://ajptour.com/en/profile/${ajpId}` })
          .where(eq(tournamentOpponents.id, opponentId))
      }
      return ajpId
    })

    if (ajpAthleteId) {
      const _ajpAthleteId = ajpAthleteId
      await step.run('fetch-ajp-totals', async () => {
        try {
          let wins = 0, losses = 0
          let profileApiWorked = false

          try {
            const firstPage = await fetchAjpEventsPage(_ajpAthleteId, 1)
            const allEvents: AjpEvent[] = [...(firstPage.data ?? [])]
            for (let p = 2; p <= (firstPage.last_page ?? 1); p++) {
              await sleep(PAGINATION_DELAY_MS)
              const page = await fetchAjpEventsPage(_ajpAthleteId, p)
              allEvents.push(...(page.data ?? []))
            }
            for (const ev of allEvents) {
              if (ev.upcomingEvent) continue
              for (const reg of ev.registrations) {
                if (!reg.published && reg.matches.length === 0) continue
                wins += reg.matches.filter(m => m.is_winner).length
                losses += reg.matches.filter(m => !m.is_winner).length
              }
            }
            profileApiWorked = true
          } catch { /* profile events API blocked (403) — fall through to participants fallback */ }

          if (!profileApiWorked) {
            // Profile events API is restricted for this athlete. Fall back to searching for
            // AJP event URLs via Brave, then counting matches from the participants API
            // (POST /event/{id}/participants) which is not subject to the same restriction.
            const apiKey = process.env.BRAVE_API_KEY
            const candidateUrls: string[] = []
            if (apiKey) {
              for (const query of nameSearchQueries(athleteName, 'ajptour.com')) {
                try {
                  const resp = await fetch(
                    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
                    { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
                  )
                  if (!resp.ok) continue
                  const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
                  candidateUrls.push(...(data.web?.results?.map(r => r.url) ?? []))
                } catch { continue }
              }
            }
            const eventIds = [...new Set(
              candidateUrls
                .map(u => u.match(/ajptour\.com\/[a-z]{0,10}\/?event\/(\d+)/)?.[1])
                .filter((id): id is string => !!id)
            )]
            for (const eventId of eventIds.slice(0, 10)) {
              try {
                const pResp = await fetch(`https://ajptour.com/en/event/${eventId}/participants`, {
                  method: 'POST',
                  headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                  body: '{}',
                  signal: AbortSignal.timeout(15000),
                })
                if (!pResp.ok) continue
                const pData = await pResp.json() as {
                  participants: Array<{ registrations: Array<{ user_id: number; matches?: AjpMatch[]; published?: boolean }> }>
                }
                for (const participant of pData.participants ?? []) {
                  for (const reg of participant.registrations ?? []) {
                    if (String(reg.user_id) !== _ajpAthleteId) continue
                    const matches = reg.matches ?? []
                    wins += matches.filter(m => m.is_winner).length
                    losses += matches.filter(m => !m.is_winner).length
                  }
                }
              } catch { continue }
            }
          }

          if (wins > 0 || losses > 0) {
            await db.update(tournamentOpponents)
              .set({ ajpWins: wins, ajpLosses: losses })
              .where(eq(tournamentOpponents.id, opponentId))
          }
          return { wins, losses }
        } catch { return { skipped: true } }
      })
    }

    // --- Smoothcomp (smoothcomp.com — independent from AJP) ---
    await step.run('fetch-smoothcomp-totals', async () => {
      try {
        const storedScId = opponent?.smoothcompAthleteId ?? null
        let profiles: Array<{ baseUrl: string; athleteId: string }> = []
        if (storedScId) {
          try {
            const verified = await verifySmoothcompProfileName(storedScId, athleteName)
            if (verified) {
              profiles = [{ baseUrl: 'https://smoothcomp.com', athleteId: storedScId }]
            }
          } catch { /* fall through to name search */ }
        }
        if (profiles.length === 0) {
          profiles = await findSmoothcompProfiles(athleteName)
        }
        if (profiles.length === 0) {
          await db.update(tournamentOpponents)
            .set({ smoothcompWins: null, smoothcompLosses: null, smoothcompFedUrl: null })
            .where(eq(tournamentOpponents.id, opponentId))
          return { wins: 0, losses: 0 }
        }

        let wins = 0, losses = 0
        for (const { baseUrl, athleteId: scAthleteId } of profiles) {
          try {
            const firstPage = await fetchSmoothcompEventsPage(baseUrl, scAthleteId, 1)
            const allEvents: AjpEvent[] = [...(firstPage.data ?? [])]
            for (let p = 2; p <= (firstPage.last_page ?? 1); p++) {
              await sleep(PAGINATION_DELAY_MS)
              const page = await fetchSmoothcompEventsPage(baseUrl, scAthleteId, p)
              allEvents.push(...(page.data ?? []))
            }
            for (const ev of allEvents) {
              if (ev.upcomingEvent) continue
              for (const reg of ev.registrations) {
                if (!reg.published && reg.matches.length === 0) continue
                wins += reg.matches.filter(m => m.is_winner).length
                losses += reg.matches.filter(m => !m.is_winner).length
              }
            }
          } catch { continue }
        }

        const fedUrl = `https://smoothcomp.com/en/profile/${profiles[0].athleteId}`

        // Try to fetch the profile photo from Smoothcomp's og:image meta tag
        let profilePhotoUrl: string | null = null
        try {
          const profileHtml = await fetch(fedUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
            signal: AbortSignal.timeout(10000),
          }).then(r => r.text())
          const ogMatch = profileHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            ?? profileHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
          if (ogMatch?.[1] && !ogMatch[1].includes('default') && !ogMatch[1].includes('placeholder')) {
            profilePhotoUrl = ogMatch[1]
          }
        } catch { /* photo fetch is best-effort */ }

        if (wins > 0 || losses > 0) {
          await db.update(tournamentOpponents)
            .set({
              smoothcompWins: wins, smoothcompLosses: losses, smoothcompFedUrl: fedUrl,
              ...(profilePhotoUrl ? { profilePhotoUrl } : {}),
            })
            .where(eq(tournamentOpponents.id, opponentId))
        } else {
          // Profile found but data not public — save URL so UI can show "Private" instead of "N/A"
          await db.update(tournamentOpponents)
            .set({
              smoothcompFedUrl: fedUrl,
              ...(profilePhotoUrl ? { profilePhotoUrl } : {}),
            })
            .where(eq(tournamentOpponents.id, opponentId))
        }
        return { wins, losses }
      } catch { return { skipped: true } }
    })

    // --- IBJJF via BJJ Metrics + jiujitsu.net medal ---
    await step.run('fetch-ibjjf-totals', async () => {
      const dbUpdate: Record<string, unknown> = {}
      let bjjmetricsExactSlug: string | null = null

      // BJJ Metrics: W/L from final matches
      try {
        const searchResp = await fetch('https://bjjmetrics.com/search_ibjjf_matches_names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          body: JSON.stringify({ name: athleteName }),
          signal: AbortSignal.timeout(15000),
        })
        if (searchResp.ok) {
          const searchData = await searchResp.json() as { success: boolean; names?: Array<{ name: string }> }
          if (searchData.success && searchData.names?.length) {
            const exactName = searchData.names[0].name
            const matchesResp = await fetch('https://bjjmetrics.com/get_ibjjf_matches', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
              body: JSON.stringify({ name: exactName }),
              signal: AbortSignal.timeout(15000),
            })
            if (matchesResp.ok) {
              const matchesData = await matchesResp.json() as {
                success: boolean
                matches?: Array<{ winner_name: string; loser_name: string }>
              }
              if (matchesData.success && matchesData.matches?.length) {
                const fighterSlug = exactName.toLowerCase().replace(/\s+/g, '-')
                dbUpdate.ibjjfProfileUrl = `https://bjjmetrics.com/fighter/${fighterSlug}`
                bjjmetricsExactSlug = fighterSlug
              }
            }
          }
        }
      } catch { /* non-fatal */ }

      // jiujitsu.net: medals via /api/athlete/{slug} (search endpoint returns HTML as of May 2026)
      // Try slug variants: bjjmetrics exact name (most reliable), full stored name, then first+last only
      try {
        const PLACE_LABEL: Record<number, string> = { 1: 'Gold', 2: 'Silver', 3: 'Bronze' }
        const nameParts = athleteName.trim().split(/\s+/)
        const normalizedSlugName = normalizeName(athleteName).replace(/\s+/g, '-')
        const slugVariants = [
          ...(bjjmetricsExactSlug ? [bjjmetricsExactSlug] : []),
          athleteName.toLowerCase().replace(/\s+/g, '-'),
          normalizedSlugName,
          ...(nameParts.length > 2 ? [`${nameParts[0]}-${nameParts[nameParts.length - 1]}`.toLowerCase()] : []),
        ].filter((s, i, arr) => arr.indexOf(s) === i) // deduplicate
        for (const slug of slugVariants) {
          const athleteResp = await fetch(
            `https://jiujitsu.net/api/athlete/${slug}?gi=true&all_medals=false`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) }
          )
          if (!athleteResp.ok) continue
          const body = await athleteResp.json() as {
            athlete?: { name?: string }
            medals?: Array<{ place: number; event_name: string; happened_at?: string; event_medals_only?: boolean | null }>
          }
          const foundName = normalizeName(body.athlete?.name ?? '')
          const namePartsLower = normalizeName(athleteName).split(/\s+/).filter(p => p.length > 1)
          const matchCount = namePartsLower.filter(p => foundName.includes(p)).length
          if (matchCount < nameMatchThreshold(namePartsLower)) continue

          const medals = body.medals ?? []
          if (!medals.length) break

          // Deduplicate per event: jiujitsu.net sometimes returns both an "event_medals_only" entry
          // and a "(Results)" duplicate for the same event. Keep one entry per event, preferring
          // the event_medals_only version. Do NOT filter globally — an athlete can have medals
          // at multiple events, some with event_medals_only=true and some without.
          const eventMap = new Map<string, typeof medals[0]>()
          for (const medal of medals) {
            const key = medal.event_name.replace(/\s*\(Results\)\s*$/i, '').trim()
            const existing = eventMap.get(key)
            if (!existing) {
              eventMap.set(key, medal)
            } else if (medal.event_medals_only === true && existing.event_medals_only !== true) {
              eventMap.set(key, medal)
            } else if (medal.event_medals_only === existing.event_medals_only && medal.place < existing.place) {
              eventMap.set(key, medal)
            }
          }
          const sorted = [...eventMap.values()].sort((a, b) => a.place - b.place)

          dbUpdate.ibjjfBestResult = sorted.map(m => {
            const label = PLACE_LABEL[m.place] ?? `${m.place}th`
            const year = m.happened_at ? new Date(m.happened_at).getFullYear() : null
            // Only append year if not already in the event name
            const yearStr = year ? String(year) : null
            const nameHasYear = yearStr && m.event_name.includes(yearStr)
            return nameHasYear ? `${label} – ${m.event_name}` : year ? `${label} – ${m.event_name} ${year}` : `${label} – ${m.event_name}`
          }).join('|')
          break
        }
      } catch { /* non-fatal */ }

      // Fallback: jiujitsu.net had no medals — try bjjmetrics career medal counts
      if (!dbUpdate.ibjjfBestResult && bjjmetricsExactSlug) {
        const medalCounts = await fetchBjjmetricsMedalCounts(bjjmetricsExactSlug)
        if (medalCounts) dbUpdate.ibjjfBestResult = medalCounts
      }

      if (Object.keys(dbUpdate).length > 0) {
        await db.update(tournamentOpponents)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(dbUpdate as any)
          .where(eq(tournamentOpponents.id, opponentId))
      }
      return dbUpdate
    })

    await step.run('mark-done', () =>
      db.update(tournamentOpponents)
        .set({ intelStatus: 'done' })
        .where(eq(tournamentOpponents.id, opponentId))
    )

    return { ajpAthleteId: ajpAthleteId ?? null }
  }
)
