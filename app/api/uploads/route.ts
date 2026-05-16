import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/db'
import { videos } from '../../../lib/db/schema'
import { generateVideoPath, getSignedUploadUrl } from '../../../lib/storage/supabase-storage'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType, size, sourceType, format, appearanceHint } = await req.json()

    if (!filename) return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    if (!contentType?.startsWith('video/')) return NextResponse.json({ error: 'Only video files are accepted' }, { status: 400 })
    if (size > 2 * 1024 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 2 GB limit' }, { status: 400 })

    const path = generateVideoPath(filename)
    const { signedUrl } = await getSignedUploadUrl(path)

    const [video] = await db.insert(videos).values({
      userId: null,
      r2Key: path,
      originalFilename: filename,
      contentType,
      sizeBytes: size,
      sourceType: (sourceType ?? 'own_competition') as 'own_competition' | 'own_sparring' | 'opponent' | 'public_url',
      publicUrl: null,
      status: 'uploaded',
    }).returning()

    return NextResponse.json({ uploadUrl: signedUrl, path, videoId: video.id, appearanceHint })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[uploads/presign]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
