import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { eq } from 'drizzle-orm'

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

type AjpEventsPage = {
  current_page: number
  last_page: number
  data: AjpEvent[]
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
async function verifyAjpProfileName(athleteId: string, expectedName: string): Promise<boolean> {
  try {
    const page = await fetchAjpEventsPage(athleteId, 1)
    if (!page.data?.length) return false

    // Find first event with matches or published registrations
    const firstEvent = page.data.find(ev => !ev.upcomingEvent)
    if (!firstEvent) return false

    const eventId = String(firstEvent.info.id)
    const pResp = await fetch(`https://ajptour.com/en/event/${eventId}/participants`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!pResp.ok) return false

    const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
    const expectedLower = expectedName.toLowerCase()
    const nameParts = expectedLower.split(/\s+/).filter(p => p.length > 1)
    // Require all parts for short names (≤3 words), 2/3 for longer
    const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)

    for (const participant of pData.participants ?? []) {
      for (const reg of participant.registrations ?? []) {
        if (String(reg.user_id) !== athleteId) continue
        const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
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

// Multi-engine search for AJP athlete profile — Brave → Gemini+Google Search grounding
// Profile URL gives the athlete ID directly; event URL triggers participants POST fallback.
async function findAjpAthleteIdByName(name: string): Promise<string | null> {
  // 1. Brave Search API (JSON, no bot issues — but AJP not always indexed)
  const apiKey = process.env.BRAVE_API_KEY
  if (apiKey) {
    for (const query of [`"${name}" site:ajptour.com`, `${name} site:ajptour.com`, `"${name}" ajptour.com`]) {
      try {
        const resp = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
          { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
        )
        if (!resp.ok) continue
        const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
        const urls = (data.web?.results ?? []).map(r => r.url)
        if (urls.length > 0) {
          for (const url of urls) {
            const m = url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
            if (m && await verifyAjpProfileName(m[1], name)) return m[1]
          }
          const eventIds = [...new Set(urls.map(u => u.match(/ajptour\.com\/[a-z]{0,10}\/?event\/(\d+)/)?.[1]).filter(Boolean) as string[])]
          if (eventIds.length > 0) {
            const found = await findIdFromEventParticipants(eventIds, name)
            if (found) return found
          }
        }
      } catch { continue }
    }
  }

  // 2. Gemini + Google Search grounding (real Google results, no bot-blocking)
  const geminiUrls = await geminiGroundedSearch(
    `Search for the exact ajptour.com profile page of BJJ athlete named "${name}". I need the direct URL like https://ajptour.com/en/profile/NUMBERS. Only return URLs that contain the athlete's exact name.`,
    'ajptour.com'
  )
  if (geminiUrls.length > 0) {
    // Verify each profile belongs to this athlete by name via participants API
    for (const url of geminiUrls) {
      const m = url.match(/ajptour\.com\/[a-z]{0,5}\/profile\/(\d+)/)
      if (m) {
        const isRight = await verifyAjpProfileName(m[1], name)
        if (isRight) return m[1]
      }
    }
    const eventIds = [...new Set(geminiUrls.map(u => u.match(/ajptour\.com\/[a-z]{0,10}\/?event\/(\d+)/)?.[1]).filter(Boolean) as string[])]
    if (eventIds.length > 0) {
      const found = await findIdFromEventParticipants(eventIds, name)
      if (found) return found
    }
  }

  return null
}

async function findIdFromEventParticipants(eventIds: string[], name: string): Promise<string | null> {
  const nameLower = name.toLowerCase()
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
          const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
          if (fullName.includes(nameLower) || nameLower.includes(fullName.split(' ')[0])) {
            return String(reg.user_id)
          }
        }
      }
    } catch { continue }
  }
  return null
}

// Extract smoothcomp profile entries from a list of raw URLs
function extractSmoothcompProfiles(urls: string[]): Array<{ baseUrl: string; athleteId: string }> {
  const seen = new Set<string>()
  const profiles: Array<{ baseUrl: string; athleteId: string }> = []
  for (const url of urls) {
    const m = url.match(/^(https?:\/\/(?:[a-z0-9-]+\.)?smoothcomp\.com)\/[a-z]{0,5}\/profile\/(\d+)/)
    if (m && !seen.has(m[1])) { seen.add(m[1]); profiles.push({ baseUrl: m[1], athleteId: m[2] }) }
  }
  return profiles
}

// Same identity verification as verifyAjpProfileName but for Smoothcomp subdomains
async function verifySmoothcompProfileName(baseUrl: string, athleteId: string, expectedName: string): Promise<boolean> {
  try {
    const page = await fetchSmoothcompEventsPage(baseUrl, athleteId, 1)
    if (!page.data?.length) return false
    const firstEvent = page.data.find(ev => !ev.upcomingEvent)
    if (!firstEvent) return false
    const pResp = await fetch(`${baseUrl}/en/event/${firstEvent.info.id}/participants`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    })
    if (!pResp.ok) return false
    const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
    const expectedLower = expectedName.toLowerCase()
    const nameParts = expectedLower.split(/\s+/).filter(p => p.length > 1)
    const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)
    for (const participant of pData.participants ?? []) {
      for (const reg of participant.registrations ?? []) {
        if (String(reg.user_id) !== athleteId) continue
        const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
        const matchCount = nameParts.filter(p => fullName.includes(p)).length
        if (matchCount >= threshold) return true
      }
    }
    return false
  } catch { return false }
}

// Multi-engine search for Smoothcomp profiles — Brave → Google → DuckDuckGo
// Returns one entry per unique subdomain (e.g. avasports.smoothcomp.com, smoothcomp.com)
async function findSmoothcompProfiles(name: string): Promise<Array<{ baseUrl: string; athleteId: string }>> {
  // Collect all candidate URLs across engines, then process together
  let candidateUrls: string[] = []

  // 1. Brave
  const apiKey = process.env.BRAVE_API_KEY
  if (apiKey) {
    for (const query of [`"${name}" site:smoothcomp.com`, `${name} site:smoothcomp.com`, `"${name}" smoothcomp.com`]) {
      try {
        const resp = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
          { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
        )
        if (!resp.ok) continue
        const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
        const urls = (data.web?.results ?? []).map(r => r.url)
        if (urls.length > 0) { candidateUrls = urls; break }
      } catch { continue }
    }
  }

  // 2. Gemini + Google Search grounding
  if (candidateUrls.length === 0) {
    candidateUrls = await geminiGroundedSearch(
      `Find smoothcomp.com profile URLs for BJJ athlete "${name}". Return the profile URLs.`,
      'smoothcomp.com'
    )
  }

  if (candidateUrls.length === 0) return []

  const nameParts = name.toLowerCase().split(/\s+/).filter(p => p.length > 1)
  const threshold = nameParts.length <= 3 ? nameParts.length : Math.ceil(nameParts.length * 2 / 3)

  // Verify direct profile URLs before accepting
  const directProfiles = extractSmoothcompProfiles(candidateUrls)
  const verifiedDirect: Array<{ baseUrl: string; athleteId: string }> = []
  for (const profile of directProfiles) {
    const ok = await verifySmoothcompProfileName(profile.baseUrl, profile.athleteId, name)
    if (ok) verifiedDirect.push(profile)
  }
  if (verifiedDirect.length > 0) return verifiedDirect

  // Fall back: extract unique {baseUrl, eventId} pairs — one per subdomain
  const seen = new Map<string, string>() // baseUrl → first eventId found
  for (const url of candidateUrls) {
    const m = url.match(/^(https?:\/\/(?:[a-z0-9-]+\.)?smoothcomp\.com)\/[^/]+\/event\/(\d+)/)
    if (m && !seen.has(m[1])) seen.set(m[1], m[2])
  }

  if (seen.size === 0) return []

  const profiles: Array<{ baseUrl: string; athleteId: string }> = []

  for (const [baseUrl, eventId] of seen) {
    try {
      const pResp = await fetch(`${baseUrl}/en/event/${eventId}/participants`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: '{}',
        signal: AbortSignal.timeout(15000),
      })
      if (!pResp.ok) continue
      const pData = await pResp.json() as { participants: Array<{ registrations: Array<{ user_id: number; firstname: string; lastname: string }> }> }
      for (const participant of pData.participants ?? []) {
        for (const reg of participant.registrations ?? []) {
          const fullName = `${reg.firstname} ${reg.lastname}`.toLowerCase()
          const matchCount = nameParts.filter(p => fullName.includes(p)).length
          if (matchCount >= threshold) {
            profiles.push({ baseUrl, athleteId: String(reg.user_id) })
            break
          }
        }
        if (profiles.find(p => p.baseUrl === baseUrl)) break
      }
    } catch { continue }
  }

  return profiles
}

async function fetchSmoothcompEventsPage(baseUrl: string, athleteId: string, page: number): Promise<AjpEventsPage> {
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

async function fetchAjpEventsPage(athleteId: string, page: number): Promise<AjpEventsPage> {
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

    const opponent = await step.run('load-opponent', () =>
      db.query.tournamentOpponents.findFirst({
        where: eq(tournamentOpponents.id, opponentId),
        columns: { smoothcompAthleteId: true, smoothcompProfileUrl: true },
      })
    )

    let athleteId = opponent?.smoothcompAthleteId ?? null

    // If no athlete ID yet (manually-added opponent), try to find them via Google + participants API
    if (!athleteId) {
      const found = await step.run('find-ajp-id-by-name', async () => {
        const id = await findAjpAthleteIdByName(athleteName)
        if (id) {
          await db.update(tournamentOpponents)
            .set({ smoothcompAthleteId: id, smoothcompProfileUrl: `https://ajptour.com/en/profile/${id}` })
            .where(eq(tournamentOpponents.id, opponentId))
        }
        return { id }
      })
      if (found.id) athleteId = found.id
    }

    // --- AJP ---
    if (athleteId) {
      await step.run('fetch-ajp-totals', async () => {
        const firstPage = await fetchAjpEventsPage(athleteId, 1)
        const allEvents: AjpEvent[] = [...firstPage.data]
        for (let p = 2; p <= firstPage.last_page; p++) {
          const page = await fetchAjpEventsPage(athleteId, p)
          allEvents.push(...page.data)
        }

        let wins = 0, losses = 0
        for (const ev of allEvents) {
          if (ev.upcomingEvent) continue
          for (const reg of ev.registrations) {
            if (!reg.published && reg.matches.length === 0) continue
            wins += reg.matches.filter(m => m.is_winner).length
            losses += reg.matches.filter(m => !m.is_winner).length
          }
        }

        await db.update(tournamentOpponents)
          .set({ ajpWins: wins, ajpLosses: losses })
          .where(eq(tournamentOpponents.id, opponentId))
        return { wins, losses }
      })
    }

    // --- Smoothcomp ---
    await step.run('fetch-smoothcomp-totals', async () => {
      const profiles = await findSmoothcompProfiles(athleteName)
      if (profiles.length === 0) return { wins: 0, losses: 0 }

      let wins = 0, losses = 0
      for (const { baseUrl, athleteId: scAthleteId } of profiles) {
        const firstPage = await fetchSmoothcompEventsPage(baseUrl, scAthleteId, 1)
        const allEvents: AjpEvent[] = [...firstPage.data]
        for (let p = 2; p <= firstPage.last_page; p++) {
          const page = await fetchSmoothcompEventsPage(baseUrl, scAthleteId, p)
          allEvents.push(...page.data)
        }
        for (const ev of allEvents) {
          if (ev.upcomingEvent) continue
          for (const reg of ev.registrations) {
            if (!reg.published && reg.matches.length === 0) continue
            wins += reg.matches.filter(m => m.is_winner).length
            losses += reg.matches.filter(m => !m.is_winner).length
          }
        }
      }

      if (wins > 0 || losses > 0) {
        const firstProfile = profiles[0]
        const fedUrl = `${firstProfile.baseUrl}/en/profile/${firstProfile.athleteId}`
        await db.update(tournamentOpponents)
          .set({ smoothcompWins: wins, smoothcompLosses: losses, smoothcompFedUrl: fedUrl })
          .where(eq(tournamentOpponents.id, opponentId))
      }
      return { wins, losses }
    })

    // --- IBJJF via BJJ Metrics ---
    await step.run('fetch-ibjjf-totals', async () => {
      const searchResp = await fetch('https://bjjmetrics.com/search_ibjjf_matches_names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ name: athleteName }),
        signal: AbortSignal.timeout(15000),
      })
      if (!searchResp.ok) return { wins: 0, losses: 0 }
      const searchData = await searchResp.json() as { success: boolean; names?: Array<{ name: string }> }
      if (!searchData.success || !searchData.names?.length) return { wins: 0, losses: 0 }

      const exactName = searchData.names[0].name
      const matchesResp = await fetch('https://bjjmetrics.com/get_ibjjf_matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ name: exactName }),
        signal: AbortSignal.timeout(15000),
      })
      if (!matchesResp.ok) return { wins: 0, losses: 0 }
      const matchesData = await matchesResp.json() as {
        success: boolean
        matches?: Array<{ winner_name: string; loser_name: string }>
      }
      if (!matchesData.success || !matchesData.matches?.length) return { wins: 0, losses: 0 }

      const wins = matchesData.matches.filter(m => m.winner_name === exactName).length
      const losses = matchesData.matches.filter(m => m.loser_name === exactName).length
      const fighterSlug = exactName.toLowerCase().replace(/\s+/g, '-')

      await db.update(tournamentOpponents)
        .set({ ibjjfWins: wins, ibjjfLosses: losses, ibjjfProfileUrl: `https://bjjmetrics.com/fighter/${fighterSlug}` })
        .where(eq(tournamentOpponents.id, opponentId))
      return { wins, losses }
    })

    return { athleteId: athleteId ?? null }
  }
)
