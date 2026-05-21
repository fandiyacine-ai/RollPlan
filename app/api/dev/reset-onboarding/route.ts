import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from '@clerk/nextjs/server'

export async function POST() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  await db.update(users)
    .set({ onboardingComplete: 'false' })
    .where(eq(users.clerkId, clerkId))

  return NextResponse.json({ ok: true })
}
