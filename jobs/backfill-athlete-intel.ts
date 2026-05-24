import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents, tournaments, athleteCompetitionHistory } from '../lib/db/schema'
import { isNotNull, inArray } from 'drizzle-orm'

// One-shot backfill: two passes.
// Pass 1 — re-trigger footage discovery for opponents with a Smoothcomp ID but no history.
// Pass 2 — fire multi-federation intel (IBJJF + AJP) for ALL opponents.
// Fire via Inngest dashboard: event = "athlete-intel/backfill.run", data = {}
export const backfillAthleteIntel = inngest.createFunction(
  {
    id: 'backfill-athlete-intel',
    name: 'Backfill: Athlete Competition History',
    triggers: [{ event: 'athlete-intel/backfill.run' }],
    rateLimit: { limit: 10, period: '1m' },
  },
  async ({ step }: { step: any }) => {
    // Find opponents with Smoothcomp profiles but no history rows yet
    const candidates: Array<{
      id: string
      tournamentId: string
      smoothcompAthleteId: string
      smoothcompProfileUrl: string
      opponentLabel: string
    }> = await step.run('find-candidates', async () => {
      // IDs that already have history
      const existing = await db
        .selectDistinct({ opponentId: athleteCompetitionHistory.tournamentOpponentId })
        .from(athleteCompetitionHistory)
      const doneIds = existing.map(r => r.opponentId).filter(Boolean) as string[]

      const all = await db
        .select({
          id: tournamentOpponents.id,
          tournamentId: tournamentOpponents.tournamentId,
          smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
          smoothcompProfileUrl: tournamentOpponents.smoothcompProfileUrl,
          opponentLabel: tournamentOpponents.opponentLabel,
        })
        .from(tournamentOpponents)
        .where(isNotNull(tournamentOpponents.smoothcompAthleteId))

      return all.filter(o =>
        o.smoothcompAthleteId &&
        o.smoothcompProfileUrl &&
        !doneIds.includes(o.id)
      )
    })

    if (candidates.length === 0) return { message: 'Nothing to backfill' }

    // Fetch tournament owners so we can pass userId to the discover job
    const tournamentIds: string[] = [...new Set(candidates.map(o => o.tournamentId))]
    const ownerRows: Array<{ id: string; userId: string }> = await step.run('fetch-owners', async () => {
      if (tournamentIds.length === 0) return []
      return db
        .select({ id: tournaments.id, userId: tournaments.userId })
        .from(tournaments)
        .where(inArray(tournaments.id, tournamentIds))
    })
    const ownerByTournament = Object.fromEntries(ownerRows.map(r => [r.id, r.userId]))

    // Re-fire discover.footage — the job now persists all history before checking for footage
    const events = candidates.map(o => ({
      name: 'smoothcomp/discover.footage' as const,
      data: {
        tournamentId: o.tournamentId,
        opponentId: o.id,
        profileUrl: o.smoothcompProfileUrl,
        athleteId: o.smoothcompAthleteId,
        athleteName: o.opponentLabel,
        userId: ownerByTournament[o.tournamentId] ?? '',
      },
    }))

    await step.sendEvent('fire-discover-events', events)

    // Pass 2: fire multi-federation intel (IBJJF + AJP) for ALL opponents,
    // regardless of whether they have a Smoothcomp profile.
    const allOpponents: Array<{
      id: string
      tournamentId: string
      opponentLabel: string
    }> = await step.run('find-all-opponents', async () => {
      return db
        .select({
          id: tournamentOpponents.id,
          tournamentId: tournamentOpponents.tournamentId,
          opponentLabel: tournamentOpponents.opponentLabel,
        })
        .from(tournamentOpponents)
    })

    // Collect any additional tournament owners not already fetched
    const allTournamentIds = [...new Set(allOpponents.map(o => o.tournamentId))]
    const allOwnerRows: Array<{ id: string; userId: string }> = await step.run('fetch-all-owners', async () => {
      if (allTournamentIds.length === 0) return []
      return db
        .select({ id: tournaments.id, userId: tournaments.userId })
        .from(tournaments)
        .where(inArray(tournaments.id, allTournamentIds))
    })
    const allOwnerByTournament: Record<string, string> = Object.fromEntries(
      [...ownerRows, ...allOwnerRows].map(r => [r.id, r.userId])
    )

    const intelEvents = allOpponents.map(o => ({
      name: 'opponent-intel/build.run' as const,
      data: {
        opponentId: o.id,
        athleteName: o.opponentLabel,
        tournamentId: o.tournamentId,
        userId: allOwnerByTournament[o.tournamentId] ?? '',
      },
    }))

    if (intelEvents.length > 0) {
      await step.sendEvent('fire-intel-events', intelEvents)
    }

    return { smoothcompQueued: events.length, intelQueued: intelEvents.length }
  }
)
