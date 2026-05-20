'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../../../lib/db'
import { matches, planExecutions } from '../../../../../lib/db/schema'
import { eq, isNull, desc, and } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../../../lib/db/get-user'

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
    await db.insert(planExecutions).values({ gameplanId, actualMatchId: matchId })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function unlinkMatchFromGameplan(gameplanId: string): Promise<{ error?: string }> {
  try {
    await db.delete(planExecutions).where(eq(planExecutions.gameplanId, gameplanId))
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
