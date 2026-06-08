'use server'

import { revalidatePath } from 'next/cache'
import { db } from '../../../lib/db'
import { matches, videos, playerCards } from '../../../lib/db/schema'
import { eq, or, isNull, count, and } from 'drizzle-orm'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'
import { deleteR2Objects, deleteR2Object, isStoredInR2 } from '../../../lib/storage/r2'
import { inngest } from '../../../lib/inngest'

export async function triggerTrainingPlan(): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    // Write a "generating" placeholder immediately so the page reflects the
    // in-flight job even if the user navigates away and back before it finishes.
    const existing = await db
      .select({ id: playerCards.id })
      .from(playerCards)
      .where(and(eq(playerCards.ownerId, userId), eq(playerCards.ownerType, 'user')))
      .limit(1)
      .then(rows => rows[0] ?? null)

    if (existing) {
      await db.update(playerCards).set({ trainingPlanStatus: 'generating' }).where(eq(playerCards.id, existing.id))
    } else {
      await db.insert(playerCards).values({ ownerType: 'user', ownerId: userId, trainingPlanStatus: 'generating' })
    }

    await inngest.send({ name: 'training-plan/generate', data: { userId } })
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function getTrainingPlanStatus(): Promise<{ ready: boolean; generating: boolean }> {
  try {
    const userId = await getOrCreateDbUserId()
    const row = await db
      .select({ trainingPlan: playerCards.trainingPlan, trainingPlanStatus: playerCards.trainingPlanStatus })
      .from(playerCards)
      .where(and(eq(playerCards.ownerId, userId), eq(playerCards.ownerType, 'user')))
      .limit(1)
      .then(rows => rows[0] ?? null)
    return { ready: !!row?.trainingPlan, generating: row?.trainingPlanStatus === 'generating' }
  } catch {
    return { ready: false, generating: false }
  }
}

// Matches/videos uploaded before auth was fixed have userId = null.
// We treat those as belonging to the current user (single-tenant MVP).
const ownedOrLegacy = (userId: string) =>
  or(eq(matches.userId, userId), isNull(matches.userId))

const ownedOrLegacyVideo = (userId: string) =>
  or(eq(videos.userId, userId), isNull(videos.userId))

export async function deleteAllPlayerData(): Promise<{ error?: string }> {
  try {
    const userId = await getOrCreateDbUserId()

    // Fetch all R2 keys before deleting DB rows
    const userVideos = await db
      .select({ r2Key: videos.r2Key, thumbnailKey: videos.thumbnailR2Key })
      .from(videos)
      .where(ownedOrLegacyVideo(userId))

    const r2Keys = userVideos.flatMap(v => [v.r2Key, v.thumbnailKey].filter(Boolean) as string[])
    await deleteR2Objects(r2Keys)

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
    const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
    if (video) {
      const keys = [video.r2Key, video.thumbnailR2Key].filter(Boolean) as string[]
      await deleteR2Objects(keys)
    }
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
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (video) {
        const keys = [video.r2Key, video.thumbnailR2Key].filter(Boolean) as string[]
        await deleteR2Objects(keys)
      }
      await db.delete(videos).where(eq(videos.id, videoId))
    }
    revalidatePath('/player-card')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
