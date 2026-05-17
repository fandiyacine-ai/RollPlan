'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { matches, videos } from '../../../lib/db/schema'
import { and, eq, or, isNull, count } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'

// Matches/videos uploaded before auth was fixed have userId = null.
// We treat those as belonging to the current user (single-tenant MVP).
const ownedOrLegacy = (userId: string) =>
  or(eq(matches.userId, userId), isNull(matches.userId))

const ownedOrLegacyVideo = (userId: string) =>
  or(eq(videos.userId, userId), isNull(videos.userId))

export async function deleteAllPlayerData(): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()
    await db.delete(matches).where(ownedOrLegacy(userId))
    await db.delete(videos).where(ownedOrLegacyVideo(userId))
    revalidatePath('/player-card')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteVideo(videoId: string): Promise<{ error?: string }> {
  try {
    await getOrCreateDbUserId()
    await db.delete(videos).where(eq(videos.id, videoId))
    revalidatePath('/player-card')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteMatch(matchId: string, videoId: string): Promise<{ error?: string }> {
  try {
    await getOrCreateDbUserId()
    await db.delete(matches).where(eq(matches.id, matchId))
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
