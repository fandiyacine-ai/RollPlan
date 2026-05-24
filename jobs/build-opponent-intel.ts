import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents, athleteCompetitionHistory } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { searchIbjjfAthleteByName, scrapeIbjjfAthleteHistory } from '../lib/ibjjf/scraper'

// AJP/Smoothcomp exposes a public JSON API for athlete event history — no auth, no proxy needed.
// GET https://ajptour.com/en/profile/{athleteId}/events?page={n}
// Returns paginated competition history with match-level detail.

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

    const athleteId = opponent?.smoothcompAthleteId
    let ajpInserted = 0
    let ibjjfInserted = 0

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

    // --- IBJJF ---
    const ibjjfResult = await step.run('fetch-ibjjf-history', async () => {
      const athlete = await searchIbjjfAthleteByName(athleteName)
      if (!athlete) return { inserted: 0, found: false }

      const competitions = await scrapeIbjjfAthleteHistory(athlete.profileUrl)
      if (competitions.length === 0) return { inserted: 0, found: true }

      const rows = competitions.slice(0, 50).map(comp => ({
        smoothcompAthleteId: athleteId ?? athleteName.toLowerCase().replace(/\s+/g, '-'),
        tournamentOpponentId: opponentId,
        federation: 'ibjjf' as const,
        eventName: comp.eventName,
        eventId: `ibjjf-${comp.eventId || comp.eventName.slice(0, 20)}`,
        eventUrl: comp.eventUrl ?? null,
        eventDate: comp.date ?? null,
        placement: comp.placement ?? null,
        wins: null,
        losses: null,
        submissionWins: null,
        pointsWins: null,
        submissionLosses: null,
      }))

      const result = await db
        .insert(athleteCompetitionHistory)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: athleteCompetitionHistory.id })

      return { inserted: result.length, total: rows.length, found: true }
    })

    ibjjfInserted = ibjjfResult.inserted

    const total = ajpInserted + ibjjfInserted
    return {
      ajpInserted,
      ibjjfInserted,
      total,
      athleteId: athleteId ?? null,
    }
  }
)
