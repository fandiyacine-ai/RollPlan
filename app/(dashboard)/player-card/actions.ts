'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { matches, videos } from '../../../lib/db/schema'
import { and, eq, count } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'

export async function deleteAllPlayerData(): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    await db.delete(matches).where(eq(matches.userId, userId))
    await db.delete(videos).where(eq(videos.userId, userId))
    revalidatePath('/player-card')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteMatch(matchId: string, videoId: string): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    await db.delete(matches).where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
    // Clean up the video record if no matches remain (avoids ghost entries in "In Progress")
    const [{ remaining }] = await db.select({ remaining: count() }).from(matches).where(eq(matches.videoId, videoId))
    if (remaining === 0) {
      await db.delete(videos).where(eq(videos.id, videoId))
    }
    revalidatePath('/player-card')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
