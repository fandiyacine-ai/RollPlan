import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/db'
import { videos, matches } from '../../../lib/db/schema'
import { generateVideoPath, uploadVideo } from '../../../lib/storage/supabase-storage'
import { inngest } from '../../../lib/inngest'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const sourceType = (formData.get('sourceType') as string) ?? 'own_competition'
    const format = (formData.get('format') as string) ?? 'gi'
    const appearanceHint = (formData.get('appearanceHint') as string | null) ?? undefined

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'Only video files are accepted' }, { status: 400 })
    if (file.size > 2 * 1024 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 2 GB limit' }, { status: 400 })

    const path = generateVideoPath(file.name)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const publicUrl = await uploadVideo(path, buffer, file.type)

    const [video] = await db.insert(videos).values({
      userId: null,
      r2Key: path,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      sourceType: sourceType as 'own_competition' | 'own_sparring' | 'opponent' | 'public_url',
      publicUrl,
      status: 'uploaded',
    }).returning()

    const context = sourceType === 'own_sparring' ? 'sparring' : 'competition'

    const [match] = await db.insert(matches).values({
      videoId: video.id,
      userId: null,
      competitorLabel: 'you',
      opponentLabel: 'unknown',
      format: format as 'gi' | 'no_gi',
      context: context as 'competition' | 'sparring',
      ruleset: 'ibjjf',
      status: 'pending',
    }).returning()

    try {
      await inngest.send({ name: 'video/uploaded', data: { videoId: video.id, matchId: match.id, appearanceHint } })
    } catch {
      // Inngest not configured — analysis won't start but upload succeeded
    }

    return NextResponse.json({ videoId: video.id, matchId: match.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[upload]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
