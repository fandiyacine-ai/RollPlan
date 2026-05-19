import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournaments } from '../lib/db/schema'
import { isNull, and, isNotNull, eq } from 'drizzle-orm'
import { scrapeBracket, parseSmootcompBracketUrl } from '../lib/smoothcomp/scraper'

// Runs every 30 min. Finds all tournaments where the user pasted a Smoothcomp bracket URL
// but the bracket hasn't been detected as published yet, then scrapes each to check.
export const smoothcompMonitorBracket = inngest.createFunction(
  {
    id: 'smoothcomp-monitor-bracket',
    name: 'Smoothcomp: Monitor Bracket Publication',
    triggers: [{ cron: '*/30 * * * *' }],
  },
  async ({ step }: { step: any }) => {
    const pending = await step.run('fetch-pending', async () => {
      return db
        .select({ id: tournaments.id, userId: tournaments.userId, smoothcompUrl: tournaments.smoothcompUrl })
        .from(tournaments)
        .where(and(isNotNull(tournaments.smoothcompUrl), isNull(tournaments.bracketPublishedAt)))
    })

    for (const tournament of pending) {
      const url = tournament.smoothcompUrl!
      if (!parseSmootcompBracketUrl(url)) continue

      const result = await step.run(`check-bracket-${tournament.id}`, async () => {
        return scrapeBracket(url)
      })

      if (!result?.bracketIsPublished) continue

      await step.run(`mark-published-${tournament.id}`, async () => {
        const now = new Date()
        await db
          .update(tournaments)
          .set({ bracketPublishedAt: now, bracketFetchedAt: now })
          .where(eq(tournaments.id, tournament.id))
      })

      await step.sendEvent(`send-published-${tournament.id}`, {
        name: 'smoothcomp/bracket.published' as const,
        data: {
          tournamentId: tournament.id,
          userId: tournament.userId,
          bracketData: result,
        },
      })
    }
  }
)
