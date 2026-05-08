import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import { videos } from '../../../../lib/db/schema'
import { inngest } from '../../../../lib/inngest'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { r2Key, originalFilename, contentType, sizeBytes, sourceType } = await req.json()

  // Look up the db user record
  const { users } = await import('../../../../lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const user = await db.query.users.findFirst({ where: eq(users.clerkId, userId) })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const [video] = await db.insert(videos).values({
    userId: user.id,
    r2Key,
    originalFilename,
    contentType,
    sizeBytes,
    sourceType,
    status: 'uploaded',
  }).returning()

  await inngest.send({ name: 'video/uploaded', data: { videoId: video.id } })

  return NextResponse.json({ videoId: video.id })
}
