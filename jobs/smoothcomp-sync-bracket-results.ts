import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournaments } from '../lib/db/schema'
import { and, eq, isNull, isNotNull, lte, ne } from 'drizzle-orm'
import { syncBracketResultsForTournament } from '../lib/smoothcomp/sync-results'

const SYNC_DELAY_DAYS = 2

// Runs daily. Finds events that happened at least 2 days ago with a linked
// Smoothcomp bracket that haven't been auto-synced yet, cross-references the
// published bracket against scouted opponents to record confirmed win/loss
// results (see syncBracketResultsForTournament), then marks the tournament as
// processed and fires an event so the connections flow can pick up from there.
export const smoothcompSyncBracketResults = inngest.createFunction(
  {
    id: 'smoothcomp-sync-bracket-results',
    name: 'Smoothcomp: Sync Post-Event Bracket Results',
    triggers: [{ cron: '0 15 * * *' }], // 3 PM UTC daily
  },
  async ({ step }: { step: any }) => {
    const cutoff = new Date(Date.now() - SYNC_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const candidates = await step.run('find-unsynced-past-events', async () => {
      return db
        .select({ id: tournaments.id, userId: tournaments.userId })
        .from(tournaments)
        .where(and(
          isNotNull(tournaments.smoothcompUrl),
          isNotNull(tournaments.eventDate),
          lte(tournaments.eventDate, cutoff),
          isNull(tournaments.postEventSyncedAt),
          ne(tournaments.status, 'cancelled'),
        ))
    })

    let synced = 0

    for (const tournament of candidates) {
      const result = await step.run(`sync-bracket-${tournament.id}`, async () => {
        return syncBracketResultsForTournament(tournament.id)
      })

      // Mark processed regardless of outcome — bracket may never publish for
      // some events (cancelled brackets, IBJJF, etc.), and we don't want to
      // retry indefinitely. The connections job decides what to do with whatever
      // confirmed results (if any) ended up on the opponents.
      await step.run(`mark-synced-${tournament.id}`, async () => {
        await db
          .update(tournaments)
          .set({ postEventSyncedAt: new Date() })
          .where(eq(tournaments.id, tournament.id))
      })

      if (!result.error) synced++

      await step.sendEvent(`send-post-event-sync-${tournament.id}`, {
        name: 'tournament/post-event-sync.completed' as const,
        data: {
          tournamentId: tournament.id,
          userId: tournament.userId,
          updated: result.updated,
        },
      })
    }

    return { checked: candidates.length, synced }
  }
)
