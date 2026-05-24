import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents, athleteCompetitionHistory } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { searchIbjjfAthleteByName, scrapeIbjjfAthleteHistory } from '../lib/ibjjf/scraper'
import { searchAjpAthleteByName } from '../lib/ajp/scraper'

// Triggered whenever an opponent is created (manual add or bracket import).
// Runs IBJJF and AJP searches in parallel by athlete name.
// IBJJF: fully separate federation — scraped and stored as federation='ibjjf'.
// AJP: runs on Smoothcomp's platform — if athlete found and not yet linked,
//      updates the opponent record and fires smoothcomp/discover.footage.
export const buildOpponentIntel = inngest.createFunction(
  {
    id: 'build-opponent-intel',
    name: 'Build: Multi-federation Opponent Intel',
    triggers: [{ event: 'opponent-intel/build.run' }],
    retries: 1,
    rateLimit: { limit: 5, period: '1m' },
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
    const { opponentId, athleteName, tournamentId, userId } = event.data

    // Run IBJJF search and current opponent state in parallel
    const [ibjjfAthlete, opponent] = await Promise.all([
      step.run('ibjjf-search', () => searchIbjjfAthleteByName(athleteName)),
      step.run('load-opponent', () =>
        db.query.tournamentOpponents.findFirst({
          where: eq(tournamentOpponents.id, opponentId),
          columns: { smoothcompAthleteId: true },
        })
      ),
    ])

    // Store IBJJF competition history
    const ibjjfCount: number = await step.run('ibjjf-store', async () => {
      if (!ibjjfAthlete) return 0

      const history = await scrapeIbjjfAthleteHistory(ibjjfAthlete.profileUrl)
      if (history.length === 0) return 0

      let count = 0
      for (const comp of history) {
        const rows = await db
          .insert(athleteCompetitionHistory)
          .values({
            smoothcompAthleteId: `ibjjf-${ibjjfAthlete.athleteId}`,
            tournamentOpponentId: opponentId,
            federation: 'ibjjf',
            eventName: comp.eventName,
            eventId: comp.eventId,
            eventUrl: comp.eventUrl,
            eventDate: comp.date ?? null,
            placement: comp.placement ?? null,
          })
          .onConflictDoNothing()
          .returning({ id: athleteCompetitionHistory.id })
        if (rows.length > 0) count++
      }
      return count
    })

    // AJP: only search if no Smoothcomp profile linked yet
    // (AJP runs on Smoothcomp — same platform, same IDs, same scraper)
    let ajpQueued = false
    if (!opponent?.smoothcompAthleteId) {
      const ajpAthlete = await step.run('ajp-search', () => searchAjpAthleteByName(athleteName))

      if (ajpAthlete) {
        await step.run('ajp-link', async () => {
          await db.update(tournamentOpponents).set({
            smoothcompAthleteId: ajpAthlete.athleteId,
            smoothcompProfileUrl: ajpAthlete.profileUrl,
            footageStatus: 'pending',
          }).where(eq(tournamentOpponents.id, opponentId))
        })

        // Fire the standard Smoothcomp discover job — handles history + footage
        await step.sendEvent('fire-ajp-discover', {
          name: 'smoothcomp/discover.footage' as const,
          data: {
            tournamentId,
            opponentId,
            profileUrl: ajpAthlete.profileUrl,
            athleteId: ajpAthlete.athleteId,
            athleteName,
            userId,
          },
        })
        ajpQueued = true
      }
    }

    return { ibjjfEvents: ibjjfCount, ajpQueued }
  }
)
