import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights, aiCallLogs } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { inngest } from '../../../../lib/inngest'

function isAdmin(clerkId: string | null) {
  const adminId = process.env.ADMIN_CLERK_USER_ID
  return !!adminId && clerkId === adminId
}

// POST /api/admin/reanalyze — wipe analysis data and re-fire the full pipeline
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!isAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { matchId } = await req.json()
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 })

  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const video = await db.query.videos.findFirst({ where: eq(videos.id, match.videoId) })
  if (!video?.publicUrl) return NextResponse.json({ error: 'Video has no public URL — cannot re-analyse' }, { status: 400 })

  // Clear all derived analysis data
  await db.transaction(async (tx) => {
    await tx.delete(insights).where(eq(insights.matchId, matchId))
    await tx.delete(matchEvents).where(eq(matchEvents.matchId, matchId))
    await tx.delete(positionSegments).where(eq(positionSegments.matchId, matchId))
    // Reset match status
    await tx.update(matches)
      .set({ status: 'pending', narration: null })
      .where(eq(matches.id, matchId))
    // Reset video status so the pipeline doesn't skip it
    await tx.update(videos)
      .set({ status: 'uploaded' })
      .where(eq(videos.id, match.videoId))
  })

  // Fire the full analysis pipeline
  await inngest.send({
    name: 'video/uploaded',
    data: { videoId: match.videoId, matchId },
  })

  return NextResponse.json({ queued: true, matchId, videoId: match.videoId })
}

// GET /api/admin/reanalyze?matchId=... — return AI call logs for this match
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!isAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const matchId = req.nextUrl.searchParams.get('matchId')
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 })

  const logs = await db.query.aiCallLogs.findMany({
    where: eq(aiCallLogs.jobId, matchId),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  })

  return NextResponse.json(logs)
}
