import { db } from '.'
import { matches, users } from './schema'
import { eq, and, gte, count } from 'drizzle-orm'

export const FREE_MONTHLY_MATCH_LIMIT = 10

export async function getMonthlyMatchCount(userId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [row] = await db
    .select({ total: count() })
    .from(matches)
    .where(and(
      eq(matches.userId, userId),
      eq(matches.status, 'analysed'),
      gte(matches.createdAt, startOfMonth),
    ))

  return row?.total ?? 0
}

export async function checkMonthlyLimit(userId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const [user] = await db.select({ planTier: users.planTier }).from(users).where(eq(users.id, userId))

  // Non-free plans have no monthly cap
  if (user?.planTier && user.planTier !== 'free') {
    const used = await getMonthlyMatchCount(userId)
    return { allowed: true, used, limit: Infinity }
  }

  const used = await getMonthlyMatchCount(userId)
  return { allowed: used < FREE_MONTHLY_MATCH_LIMIT, used, limit: FREE_MONTHLY_MATCH_LIMIT }
}
