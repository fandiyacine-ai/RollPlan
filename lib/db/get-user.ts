import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from './index'
import { users } from './schema'
import { eq } from 'drizzle-orm'

export async function getOrCreateDbUserId(): Promise<string> {
  // Dev-only bypass: resolve user by email, skipping Clerk entirely
  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    const devEmail = process.env.DEV_USER_EMAIL
    if (devEmail) {
      const devUser = await db.query.users.findFirst({ where: eq(users.email, devEmail) })
      if (devUser) return devUser.id
    }
  }

  const { userId: clerkId } = await auth()
  if (!clerkId) throw new Error('Not authenticated')

  const existing = await db.query.users.findFirst({ where: eq(users.clerkId, clerkId) })
  if (existing) return existing.id

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? `${clerkId}@unknown.local`

  const [created] = await db.insert(users).values({ clerkId, email }).returning()
  return created.id
}
