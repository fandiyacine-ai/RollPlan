import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/db'
import { videos } from '../../../lib/db/schema'
import { inngest } from '../../../lib/inngest'
import { getOrCreateDbUserId } from '../../../lib/db/get-user'
import { checkMonthlyLimit } from '../../../lib/db/usage'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { athleteName, urls, format, sourceType, eventName, appearanceHint, skipScan } = await req.json()

    if (!skipScan && !athleteName?.trim()) return NextResponse.json({ error: 'Athlete name is required' }, { status: 400 })
    if (!Array.isArray(urls) || urls.length === 0) return NextResponse.json({ error: 'At least one URL is required' }, { status: 400 })
    if (urls.length > 10) return NextResponse.json({ error: 'Maximum 10 URLs per submission' }, { status: 400 })

    for (const url of urls) {
      try { new URL(url) } catch {
        return NextResponse.json({ error: `Invalid URL: ${url}` }, { status: 400 })
      }
    }

    const userId = await getOrCreateDbUserId()

    const usage = await checkMonthlyLimit(userId)
    if (!usage.allowed) {
      return NextResponse.json({
        error: `You've used all ${usage.limit} free analyses — upgrade for unlimited`,
      }, { status: 402 })
    }

    const videoIds: string[] = []

    for (const url of urls) {
      const [video] = await db.insert(videos).values({
        userId,
        r2Key: `url/${Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalFilename: url,
        contentType: 'video/mp4',
        sizeBytes: 0,
        sourceType: (sourceType ?? 'own_competition') as 'own_competition' | 'own_sparring' | 'opponent' | 'public_url',
        publicUrl: url,
        status: 'uploaded',
      }).returning()

      videoIds.push(video.id)

      try {
        await inngest.send({
          name: 'url/submitted',
          data: { videoId: video.id, userId, athleteName: athleteName.trim(), format: format ?? 'gi', sourceType: sourceType ?? 'own_competition', eventName: eventName?.trim() || undefined, appearanceHint: appearanceHint?.trim() || undefined, skipScan: !!skipScan },
        })
      } catch {
        // Inngest not configured — analysis won't start but record was created
      }
    }

    return NextResponse.json({ count: urls.length, videoIds })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analyse-urls]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
