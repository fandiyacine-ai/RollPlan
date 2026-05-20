'use server'

import { db } from '../../../../../lib/db'
import { matches, planExecutions, gameplans } from '../../../../../lib/db/schema'
import { eq, isNull, desc, and } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'
import { inngest } from '../../../../../lib/inngest'
import type { ExecutionDebrief } from '../../../../../lib/ai/schemas/execution-debrief'

export type OwnMatch = {
  id: string
  opponentLabel: string
  eventName: string | null
  resultWinner: string | null
  resultMethod: string | null
  resultTechnique: string | null
  createdAt: Date
}

export async function fetchOwnMatches(): Promise<OwnMatch[]> {
  const userId = await getOrCreateDbUserId()
  return db
    .select({
      id: matches.id,
      opponentLabel: matches.opponentLabel,
      eventName: matches.eventName,
      resultWinner: matches.resultWinner,
      resultMethod: matches.resultMethod,
      resultTechnique: matches.resultTechnique,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .where(and(eq(matches.userId, userId), isNull(matches.tournamentOpponentId)))
    .orderBy(desc(matches.createdAt))
    .limit(20) as Promise<OwnMatch[]>
}

export async function linkMatchToGameplan(
  gameplanId: string,
  matchId: string,
): Promise<{ error?: string }> {
  try {
    // Upsert: delete any existing link for this gameplan first
    await db.delete(planExecutions).where(eq(planExecutions.gameplanId, gameplanId))
    const [execution] = await db
      .insert(planExecutions)
      .values({ gameplanId, actualMatchId: matchId })
      .returning()

    // Fire the debrief generation job
    try {
      await inngest.send({
        name: 'execution-debrief/requested',
        data: { planExecutionId: execution.id, gameplanId, matchId },
      })
    } catch {
      // Non-fatal — debrief generation is best-effort
    }

    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function fetchExecutionDebrief(gameplanId: string): Promise<ExecutionDebrief | null> {
  const execution = await db.query.planExecutions.findFirst({
    where: eq(planExecutions.gameplanId, gameplanId),
  })
  if (!execution?.executionReview) return null
  const review = execution.executionReview as Record<string, unknown>
  return Object.keys(review).length > 0 ? review as ExecutionDebrief : null
}

export async function unlinkMatchFromGameplan(gameplanId: string): Promise<{ error?: string }> {
  try {
    await db.delete(planExecutions).where(eq(planExecutions.gameplanId, gameplanId))
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
