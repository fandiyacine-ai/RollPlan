import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { getPresignedUploadUrl, generateVideoKey } from '../../../../lib/storage/r2'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { filename, contentType, sizeBytes } = await req.json()
  if (!filename || !contentType) {
    return NextResponse.json({ error: 'filename and contentType required' }, { status: 400 })
  }

  if (!contentType.startsWith('video/')) {
    return NextResponse.json({ error: 'Only video files are accepted' }, { status: 400 })
  }

  if (sizeBytes > 2 * 1024 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 2 GB limit' }, { status: 400 })
  }

  const key = generateVideoKey(userId, filename)
  const url = await getPresignedUploadUrl(key, contentType)

  return NextResponse.json({ url, key })
}
