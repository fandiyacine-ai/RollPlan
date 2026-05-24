import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents, athleteCompetitionHistory } from '../lib/db/schema'
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

function ordinal(n: number | null): string | null {
  if (n === null) return null
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

// Brave Search → extract AJP event IDs from result URLs → POST participants → get user_id
async function findAjpAthleteIdByName(name: string): Promise<string | null> {
  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) return null

  // Step 1: Brave search for AJP event pages featuring this athlete
  const query = encodeURIComponent(`"${name}" site:ajptour.com`)
  const resp = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${query}&count=10`,
    {
      headers: {
        'X-Subscription-Token': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!resp.ok) return null

  const data = await resp.json() as {
    web?: { results?: Array<{ url: string; description: string; extra_snippets?: string[] }> }
  }
  const results = data.web?.results ?? []

  // Extract AJP event IDs from result URLs
  const eventIds = [...new Set(
    results
      .map(r => r.url.match(/ajptour\.com\/[a-z]{0,10}\/?event\/(\d+)/)?.[1])
      .filter((id): id is string => !!id)
  )]

  if (eventIds.length === 0) return null

  // Step 2: For each found event, POST to participants and search by name
  const nameLower = name.toLowerCase()
  for (const eventId of eventIds.slice(0, 5)) {
    try {
      const pResp = await fetch(`https://ajptour.com/en/event/${eventId}/participants`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
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

// Brave Search → find Smoothcomp federation subdomains + athlete IDs from event participants
// Returns one entry per unique subdomain (e.g. avasports.smoothcomp.com, smoothcomp.com)
async function findSmoothcompProfiles(name: string): Promise<Array<{ baseUrl: string; athleteId: string }>> {
  const apiKey = process.env.BRAVE_API_KEY
  if (!apiKey) return []

  const query = encodeURIComponent(`"${name}" site:smoothcomp.com`)
  const resp = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${query}&count=10`,
    {
      headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!resp.ok) return []

  const data = await resp.json() as { web?: { results?: Array<{ url: string }> } }
  const results = data.web?.results ?? []

  // Extract unique {baseUrl, eventId} pairs — one per subdomain
  const seen = new Map<string, string>() // baseUrl → first eventId found
  for (const r of results) {
    const m = r.url.match(/^(https?:\/\/(?:[a-z0-9-]+\.)?smoothcomp\.com)\/[^/]+\/event\/(\d+)/)
    if (m && !seen.has(m[1])) seen.set(m[1], m[2])
  }

  if (seen.size === 0) return []

  const nameLower = name.toLowerCase()
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
          if (fullName.includes(nameLower) || nameLower.includes(fullName.split(' ')[0])) {
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
    headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'Mozilla/5.0' },
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
    let ajpInserted = 0
    let ibjjfInserted = 0

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

    // --- AJP / Smoothcomp ---
    if (athleteId) {
      const ajpResult = await step.run('fetch-ajp-history', async () => {
        const firstPage = await fetchAjpEventsPage(athleteId, 1)
        const allEvents: AjpEvent[] = [...firstPage.data]

        for (let p = 2; p <= firstPage.last_page; p++) {
          const page = await fetchAjpEventsPage(athleteId, p)
          allEvents.push(...page.data)
        }

        // Build rows — one row per registration (division) per event
        const rows: Array<typeof athleteCompetitionHistory.$inferInsert> = []

        for (const ev of allEvents) {
          if (ev.upcomingEvent) continue
          const eventUrl = `https://ajptour.com/en/event/${ev.info.id}`
          const eventDate = ev.info.event_start
            ? new Date(ev.info.event_start).toISOString().slice(0, 10)
            : null

          for (const reg of ev.registrations) {
            if (!reg.published && reg.matches.length === 0) continue

            const wins = reg.matches.filter(m => m.is_winner).length
            const losses = reg.matches.filter(m => !m.is_winner).length
            const submissionWins = reg.matches.filter(m => m.is_winner && m.outcome.toLowerCase().includes('submission')).length
            const pointsWins = wins - submissionWins
            const submissionLosses = reg.matches.filter(m => !m.is_winner && m.outcome.toLowerCase().includes('submission')).length

            rows.push({
              smoothcompAthleteId: athleteId,
              tournamentOpponentId: opponentId,
              federation: 'ajp',
              eventName: `${ev.info.title} — ${reg.group}`,
              eventId: `ajp-${ev.info.id}-${reg.id}`,
              eventUrl,
              eventDate,
              placement: ordinal(reg.placement),
              wins,
              losses,
              submissionWins,
              pointsWins,
              submissionLosses,
            })
          }
        }

        if (rows.length === 0) return { inserted: 0 }

        const result = await db
          .insert(athleteCompetitionHistory)
          .values(rows)
          .onConflictDoNothing()
          .returning({ id: athleteCompetitionHistory.id })

        return { inserted: result.length, total: rows.length }
      })

      ajpInserted = ajpResult.inserted
    }

    // --- Smoothcomp (non-AJP federation events) ---
    // Same API as AJP but on smoothcomp.com subdomains (e.g. avasports.smoothcomp.com)
    // Each federation subdomain has its own athlete IDs — find them via Brave search + participants POST
    let smoothcompInserted = 0
    const smoothcompResult = await step.run('fetch-smoothcomp-history', async () => {
      const profiles = await findSmoothcompProfiles(athleteName)
      if (profiles.length === 0) return { inserted: 0 }

      const rows: Array<typeof athleteCompetitionHistory.$inferInsert> = []
      const athleteKey = athleteId ?? athleteName.toLowerCase().replace(/\s+/g, '-')

      for (const { baseUrl, athleteId: scAthleteId } of profiles) {
        // Derive a short federation label from the subdomain (e.g. "avasports")
        const subdomainLabel = new URL(baseUrl).hostname.replace('.smoothcomp.com', '').replace('smoothcomp.com', 'smoothcomp')

        const firstPage = await fetchSmoothcompEventsPage(baseUrl, scAthleteId, 1)
        const allEvents: AjpEvent[] = [...firstPage.data]
        for (let p = 2; p <= firstPage.last_page; p++) {
          const page = await fetchSmoothcompEventsPage(baseUrl, scAthleteId, p)
          allEvents.push(...page.data)
        }

        for (const ev of allEvents) {
          if (ev.upcomingEvent) continue
          const eventUrl = `${baseUrl}/en/event/${ev.info.id}`
          const eventDate = ev.info.event_start ? new Date(ev.info.event_start).toISOString().slice(0, 10) : null

          for (const reg of ev.registrations) {
            if (!reg.published && reg.matches.length === 0) continue
            const wins = reg.matches.filter(m => m.is_winner).length
            const losses = reg.matches.filter(m => !m.is_winner).length
            const submissionWins = reg.matches.filter(m => m.is_winner && m.outcome.toLowerCase().includes('submission')).length
            const submissionLosses = reg.matches.filter(m => !m.is_winner && m.outcome.toLowerCase().includes('submission')).length

            rows.push({
              smoothcompAthleteId: athleteKey,
              tournamentOpponentId: opponentId,
              federation: 'smoothcomp',
              eventName: `${ev.info.title} — ${reg.group}`,
              eventId: `sc-${subdomainLabel}-${ev.info.id}-${reg.id}`,
              eventUrl,
              eventDate,
              placement: ordinal(reg.placement),
              wins,
              losses,
              submissionWins,
              pointsWins: wins - submissionWins,
              submissionLosses,
            })
          }
        }
      }

      if (rows.length === 0) return { inserted: 0 }

      const result = await db
        .insert(athleteCompetitionHistory)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: athleteCompetitionHistory.id })

      return { inserted: result.length, total: rows.length }
    })
    smoothcompInserted = smoothcompResult.inserted

    // --- IBJJF via BJJ Metrics (open JSON API, no auth, no Playwright) ---
    // POST /search_ibjjf_matches_names → exact name
    // POST /get_ibjjf_matches → full match history per tournament
    const ibjjfResult = await step.run('fetch-ibjjf-history', async () => {
      // Step 1: find exact name
      const searchResp = await fetch('https://bjjmetrics.com/search_ibjjf_matches_names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ name: athleteName }),
        signal: AbortSignal.timeout(15000),
      })
      if (!searchResp.ok) return { inserted: 0, found: false }
      const searchData = await searchResp.json() as { success: boolean; names?: Array<{ name: string; total_matches: string }> }
      if (!searchData.success || !searchData.names?.length) return { inserted: 0, found: false }

      const exactName = searchData.names[0].name

      // Step 2: fetch all matches for that athlete
      const matchesResp = await fetch('https://bjjmetrics.com/get_ibjjf_matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        body: JSON.stringify({ name: exactName }),
        signal: AbortSignal.timeout(15000),
      })
      if (!matchesResp.ok) return { inserted: 0, found: true }
      const matchesData = await matchesResp.json() as {
        success: boolean
        matches?: Array<{
          tournament_name: string
          division: string
          match_date: string
          winner_name: string
          loser_name: string
        }>
      }
      if (!matchesData.success || !matchesData.matches?.length) return { inserted: 0, found: true }

      // Group matches by tournament+division to compute wins/losses per event
      const groupKey = (m: { tournament_name: string; division: string }) =>
        `${m.tournament_name}||${m.division}`

      const groups = new Map<string, { wins: number; losses: number; date: string; tournament: string; division: string }>()
      for (const m of matchesData.matches) {
        const key = groupKey(m)
        const isWin = m.winner_name === exactName
        const existing = groups.get(key)
        if (existing) {
          if (isWin) { existing.wins++ } else { existing.losses++ }
        } else {
          groups.set(key, {
            wins: isWin ? 1 : 0,
            losses: isWin ? 0 : 1,
            date: m.match_date,
            tournament: m.tournament_name,
            division: m.division,
          })
        }
      }

      const athleteKey = athleteId ?? exactName.toLowerCase().replace(/\s+/g, '-')
      const rows: Array<typeof athleteCompetitionHistory.$inferInsert> = []

      for (const [, g] of groups) {
        const slug = `${g.tournament}-${g.division}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)
        rows.push({
          smoothcompAthleteId: athleteKey,
          tournamentOpponentId: opponentId,
          federation: 'ibjjf',
          eventName: `${g.tournament} — ${g.division}`,
          eventId: `ibjjf-${slug}`,
          eventUrl: `https://bjjmetrics.com/fighter/${exactName.toLowerCase().replace(/\s+/g, '-')}`,
          eventDate: g.date,
          placement: g.losses === 0 ? '1st' : null,
          wins: g.wins,
          losses: g.losses,
          submissionWins: null,
          pointsWins: null,
          submissionLosses: null,
        })
      }

      if (rows.length === 0) return { inserted: 0, found: true }

      const result = await db
        .insert(athleteCompetitionHistory)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: athleteCompetitionHistory.id })

      return { inserted: result.length, total: rows.length, found: true, exactName }
    })

    ibjjfInserted = ibjjfResult.inserted

    const total = ajpInserted + smoothcompInserted + ibjjfInserted
    return {
      ajpInserted,
      smoothcompInserted,
      ibjjfInserted,
      total,
      athleteId: athleteId ?? null,
    }
  }
)
