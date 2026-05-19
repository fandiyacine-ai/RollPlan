import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournamentOpponents } from '../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { ScBracketResult } from '../lib/smoothcomp/types'

export const smoothcompProcessBracket = inngest.createFunction(
  {
    id: 'smoothcomp-process-bracket',
    name: 'Smoothcomp: Process Bracket',
    triggers: [{ event: 'smoothcomp/bracket.published' }],
  },
  async ({ event, step }: {
    event: { data: { tournamentId: string; userId: string; bracketData: ScBracketResult } }
    step: any
  }) => {
    const { tournamentId, userId, bracketData } = event.data

    const discoverPayloads: Array<{
      name: 'smoothcomp/discover.footage'
      data: {
        tournamentId: string
        opponentId: string
        profileUrl: string
        athleteId: string
        athleteName: string
        userId: string
      }
    }> = []

    for (const athlete of bracketData.athletes) {
      const { id: opponentId, needsDiscover } = await step.run(
        `upsert-opponent-${athlete.smoothcompAthleteId}`,
        async () => {
          // Skip if this athlete is already in this tournament
          const existing = await db.query.tournamentOpponents.findFirst({
            where: and(
              eq(tournamentOpponents.tournamentId, tournamentId),
              eq(tournamentOpponents.smoothcompAthleteId, athlete.smoothcompAthleteId),
            ),
          })
          if (existing) return { id: existing.id, needsDiscover: false }

          // Check if any other tournament already has analysed footage for this athlete.
          // If so, mark as reused so we can point to the existing analysis.
          const priorWithFootage = await db.query.tournamentOpponents.findFirst({
            where: eq(tournamentOpponents.smoothcompAthleteId, athlete.smoothcompAthleteId),
          })
          const hasExistingFootage =
            priorWithFootage?.footageStatus === 'auto_ready' ||
            priorWithFootage?.footageStatus === 'manual'

          const [created] = await db
            .insert(tournamentOpponents)
            .values({
              tournamentId,
              opponentLabel: athlete.name,
              smoothcompAthleteId: athlete.smoothcompAthleteId,
              smoothcompProfileUrl: athlete.profileUrl,
              footageStatus: hasExistingFootage ? 'reused' : 'pending',
            })
            .returning({ id: tournamentOpponents.id })

          return { id: created.id, needsDiscover: !hasExistingFootage }
        }
      )

      if (!needsDiscover) continue

      discoverPayloads.push({
        name: 'smoothcomp/discover.footage',
        data: {
          tournamentId,
          opponentId,
          profileUrl: athlete.profileUrl,
          athleteId: athlete.smoothcompAthleteId,
          athleteName: athlete.name,
          userId,
        },
      })
    }

    if (discoverPayloads.length > 0) {
      await step.sendEvent('send-discover-events', discoverPayloads)
    }
  }
)
