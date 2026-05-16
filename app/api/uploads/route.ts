import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../lib/db'
import { videos } from '../../../lib/db/schema'
import { generateAnonymousVideoKey, getPresignedUploadUrl } from '../../../lib/storage/r2'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const { filename, contentType, size, sourceType, format } = await req.json()

    if (!filename) return NextResponse.json({ error: 'filename is required' }, { status: 400 })
    if (!contentType?.startsWith('video/')) return NextResponse.json({ error: 'Only video files are accepted' }, { status: 400 })
    if (size > 2 * 1024 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 2 GB limit' }, { status: 400 })

    const key = generateAnonymousVideoKey(filename)
    const uploadUrl = await getPresignedUploadUrl(key, contentType)

    const [video] = await db.insert(videos).values({
      userId: null,
      r2Key: key,
      originalFilename: filename,
      contentType,
      sizeBytes: size,
      sourceType: (sourceType ?? 'own_competition') as 'own_competition' | 'own_sparring' | 'opponent' | 'public_url',
      publicUrl: null,
    }).returning()

    return NextResponse.json({ uploadUrl, path: key, videoId: video.id })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[uploads/presign]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
