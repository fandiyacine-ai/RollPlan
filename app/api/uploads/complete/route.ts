import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import { videos, matches } from '../../../../lib/db/schema'
import { getPublicVideoUrl } from '../../../../lib/storage/r2'
import { inngest } from '../../../../lib/inngest'
import { eq } from 'drizzle-orm'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { videoId, path, sourceType, format, appearanceHint, scanMode, athleteName, eventName } = await req.json()

    if (!videoId || !path) return NextResponse.json({ error: 'videoId and path are required' }, { status: 400 })

    const publicUrl = await getPublicVideoUrl(path)
    await db.update(videos).set({ publicUrl, status: 'uploaded' }).where(eq(videos.id, videoId))

    if (scanMode === 'scan') {
      if (!athleteName) return NextResponse.json({ error: 'athleteName required for scan mode' }, { status: 400 })
      try {
        await inngest.send({
          name: 'url/submitted',
          data: {
            videoId,
            athleteName,
            format: format ?? 'gi',
            sourceType: sourceType ?? 'own_competition',
            eventName: eventName?.trim() || undefined,
            appearanceHint: appearanceHint?.trim() || undefined,
          },
        })
      } catch {
        // Inngest not configured — upload succeeded but scan won't start
      }
      return NextResponse.json({ videoId })
    }

    const context = sourceType === 'own_sparring' ? 'sparring' : 'competition'
    const [match] = await db.insert(matches).values({
      videoId,
      userId: null,
      competitorLabel: 'you',
      opponentLabel: 'unknown',
      format: (format ?? 'gi') as 'gi' | 'no_gi',
      context: context as 'competition' | 'sparring',
      ruleset: 'ibjjf',
      status: 'pending',
    }).returning()

    try {
      await inngest.send({ name: 'video/uploaded', data: { videoId, matchId: match.id, appearanceHint } })
    } catch {
      // Inngest not configured — upload succeeded but analysis won't start
    }

    return NextResponse.json({ videoId, matchId: match.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[uploads/complete]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
