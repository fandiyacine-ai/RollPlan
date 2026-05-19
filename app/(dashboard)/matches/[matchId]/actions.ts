'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../../lib/db'
import { matches } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../../lib/db/get-user'

export async function correctMatchResult(
  matchId: string,
  winner: 'user' | 'opponent' | null,
  method: string | null,
): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
    if (!match) return { error: 'Match not found' }
    if (match.userId !== userId) return { error: 'Not authorised' }

    await db.update(matches).set({
      resultWinner: winner,
      resultMethod: method,
      // Clear technique when changing method to avoid stale label
      resultTechnique: null,
    }).where(eq(matches.id, matchId))

    revalidatePath(`/matches/${matchId}`)
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
