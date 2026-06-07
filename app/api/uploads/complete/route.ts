import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import { videos, matches } from '../../../../lib/db/schema'
import { getPublicVideoUrl } from '../../../../lib/storage/r2'
import { inngest } from '../../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../../lib/db/get-user'
import { checkMonthlyLimit } from '../../../../lib/db/usage'
import { captureServerEvent } from '../../../../lib/posthog-server'
import { and, eq } from 'drizzle-orm'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { videoId, path, sourceType, format, appearanceHint, athleteImageBase64, spatialData, scanMode, athleteName, eventName, durationSeconds, tournamentOpponentId } = await req.json()

    if (!videoId || !path) return NextResponse.json({ error: 'videoId and path are required' }, { status: 400 })

    const userId = await getOrCreateDbUserId()
    const publicUrl = await getPublicVideoUrl(path)

    if (scanMode === 'scan') {
      if (!athleteName) return NextResponse.json({ error: 'athleteName required for scan mode' }, { status: 400 })

      const usage = await checkMonthlyLimit(userId)
      if (!usage.allowed) {
        return NextResponse.json({
          error: `You've used all ${usage.limit} free analyses — upgrade for unlimited`,
        }, { status: 402 })
      }
      await db.update(videos).set({
        publicUrl,
        status: 'uploaded',
        ...(durationSeconds ? { durationSeconds } : {}),
        ...(tournamentOpponentId ? { tournamentOpponentId } : {}),
      }).where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      try {
        await inngest.send({
          name: 'url/submitted',
          data: {
            videoId,
            userId,
            athleteName,
            format: format ?? 'gi',
            sourceType: sourceType ?? 'own_competition',
            eventName: eventName?.trim() || undefined,
            appearanceHint: appearanceHint?.trim() || undefined,
            athleteImageBase64: athleteImageBase64 || undefined,
            tournamentOpponentId: tournamentOpponentId || undefined,
          },
        })
      } catch {
        // Inngest not configured — upload succeeded but scan won't start
      }
      return NextResponse.json({ videoId })
    }

    const usage2 = await checkMonthlyLimit(userId)
    if (!usage2.allowed) {
      return NextResponse.json({
        error: `You've used all ${usage2.limit} free analyses — upgrade for unlimited`,
      }, { status: 402 })
    }
    await db.update(videos).set({
      publicUrl,
      status: 'uploaded',
      ...(durationSeconds ? { durationSeconds } : {}),
      ...(tournamentOpponentId ? { tournamentOpponentId } : {}),
    }).where(and(eq(videos.id, videoId), eq(videos.userId, userId)))

    const context = sourceType === 'own_sparring' ? 'sparring' : 'competition'
    const [match] = await db.insert(matches).values({
      videoId,
      userId,
      competitorLabel: 'you',
      opponentLabel: 'unknown',
      format: (format ?? 'gi') as 'gi' | 'no_gi',
      context: context as 'competition' | 'sparring',
      ruleset: 'ibjjf',
      status: 'pending',
      spatialData: spatialData ?? null,
    }).returning()

    try {
      await inngest.send({ name: 'video/uploaded', data: { videoId, matchId: match.id, appearanceHint, athleteImageBase64: athleteImageBase64 || undefined } })
    } catch {
      // Inngest not configured — upload succeeded but analysis won't start
    }

    captureServerEvent(userId, 'video_uploaded', { format, source_type: sourceType, has_opponent: !!tournamentOpponentId })
    return NextResponse.json({ videoId, matchId: match.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[uploads/complete]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
