import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '../../../../../lib/db'
import { matches } from '../../../../../lib/db/schema'
import { users } from '../../../../../lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { matchId } = await params

  const dbUser = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await db.update(matches)
    .set({ kbUpgradeSeenAt: sql`now()` })
    .where(and(eq(matches.id, matchId), eq(matches.userId, dbUser.id)))

  return NextResponse.json({ ok: true })
}
