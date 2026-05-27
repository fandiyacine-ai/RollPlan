import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '../../../../lib/db'
import { techniqueVariants } from '../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { inngest } from '../../../../lib/inngest'

function isAdmin(clerkId: string | null) {
  const adminId = process.env.ADMIN_CLERK_USER_ID
  return !!adminId && clerkId === adminId
}

function isDevBypassRequest(req: NextRequest) {
  try {
    return process.env.DEV_ADMIN_BYPASS === 'true' && req.nextUrl.searchParams.get('dev') === '1'
  } catch (e) {
    return false
  }
}

// GET /api/admin/techniques — list all variants
export async function GET(req: NextRequest) {
  if (!isDevBypassRequest(req)) {
    const { userId } = await auth()
    if (!isAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const variants = await db.query.techniqueVariants.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    })
    return NextResponse.json(variants)
  } catch (err) {
    console.error('Admin techniques GET failed:', err)
    // In dev bypass mode it's common for local DB schemas to be out of sync.
    // Return an empty array so the admin UI can render and show the error banner.
    return NextResponse.json([], { status: 200 })
  }
}

// POST /api/admin/techniques — trigger ingest from YouTube URL, or run the KB agent
export async function POST(req: NextRequest) {
  const bypass = isDevBypassRequest(req)
  if (!bypass) {
    const { userId } = await auth()
    if (!isAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // KB agent manual trigger
  if (body.action === 'run-kb-agent') {
    await inngest.send({ name: 'technique/kb-agent.run', data: {} })
    return NextResponse.json({ queued: true, agent: true })
  }

  // Backfill reference images for existing variants
  if (body.action === 'backfill-frames') {
    await inngest.send({ name: 'admin/backfill-reference-images.requested', data: {} })
    return NextResponse.json({ queued: true, backfill: true })
  }

  const { youtubeUrl, techniqueHint, positionHint } = body
  if (!youtubeUrl?.trim()) return NextResponse.json({ error: 'youtubeUrl required' }, { status: 400 })

  await inngest.send({
    name: 'technique/ingest-requested',
    data: { youtubeUrl, techniqueHint, positionHint, requestedByUserId: bypass ? 'dev-bypass' : undefined },
  })

  return NextResponse.json({ queued: true })
}

// PATCH /api/admin/techniques — update a variant (approve, reject, edit)
export async function PATCH(req: NextRequest) {
  const bypass = isDevBypassRequest(req)
  if (!bypass) {
    const { userId } = await auth()
    if (!isAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['status', 'name', 'visualCues', 'counters', 'adminNotes', 'format', 'positionId', 'eventId', 'referenceImageUrl']
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => allowed.includes(k)))

  const [updated] = await db.update(techniqueVariants)
    .set({ ...safe, updatedAt: new Date() })
    .where(eq(techniqueVariants.id, id))
    .returning()

  return NextResponse.json(updated)
}

// DELETE /api/admin/techniques?id=... — delete a variant
export async function DELETE(req: NextRequest) {
  const bypass = isDevBypassRequest(req)
  if (!bypass) {
    const { userId } = await auth()
    if (!isAdmin(userId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await db.delete(techniqueVariants).where(eq(techniqueVariants.id, id))
  return NextResponse.json({ deleted: true })
}
