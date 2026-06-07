import { db } from '.'
import { matches, users, videos, gameplans, tournaments } from './schema'
import { eq, and, gte, ne, count, sql } from 'drizzle-orm'
import { getSubscriptionStatus } from '../subscription'
import { sendCapReachedEmail } from '../email/send'

export type UserUsageStats = {
  planTier: string
  // monthly
  matchesThisMonth: number
  monthlyLimit: number  // Infinity for paid
  videoMinutesThisMonth: number
  gameplansThisMonth: number
  opponentsScoutedThisMonth: number
  // all-time
  matchesAllTime: number
  videoMinutesAllTime: number
  gameplansAllTime: number
  opponentsScoutedAllTime: number
}

export async function getUserUsageStats(userId: string): Promise<UserUsageStats> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [user] = await db.select({ planTier: users.planTier }).from(users).where(eq(users.id, userId))
  const planTier = user?.planTier ?? 'free'
  const monthlyLimit = planTier === 'free' ? FREE_MONTHLY_VIDEO_LIMIT : Infinity

  const [matchStats] = await db
    .select({
      allTime: count(),
      thisMonth: sql<number>`count(*) filter (where ${matches.createdAt} >= ${startOfMonth.toISOString()}::timestamptz)`,
      minutesAllTime: sql<number>`coalesce(sum(${videos.durationSeconds}), 0) / 60`,
      minutesThisMonth: sql<number>`coalesce(sum(${videos.durationSeconds}) filter (where ${matches.createdAt} >= ${startOfMonth.toISOString()}::timestamptz), 0) / 60`,
      opponentsAllTime: sql<number>`count(distinct ${matches.tournamentOpponentId})`,
      opponentsThisMonth: sql<number>`count(distinct ${matches.tournamentOpponentId}) filter (where ${matches.createdAt} >= ${startOfMonth.toISOString()}::timestamptz)`,
    })
    .from(matches)
    .leftJoin(videos, eq(videos.id, matches.videoId))
    .where(and(eq(matches.userId, userId), eq(matches.status, 'analysed')))

  const [gameplanStats] = await db
    .select({
      allTime: count(),
      thisMonth: sql<number>`count(*) filter (where ${gameplans.createdAt} >= ${startOfMonth.toISOString()}::timestamptz)`,
    })
    .from(gameplans)
    .innerJoin(tournaments, eq(tournaments.id, gameplans.tournamentId))
    .where(eq(tournaments.userId, userId))

  return {
    planTier,
    matchesThisMonth: Number(matchStats?.thisMonth ?? 0),
    monthlyLimit,
    videoMinutesThisMonth: Number(matchStats?.minutesThisMonth ?? 0),
    gameplansThisMonth: Number(gameplanStats?.thisMonth ?? 0),
    opponentsScoutedThisMonth: Number(matchStats?.opponentsThisMonth ?? 0),
    matchesAllTime: Number(matchStats?.allTime ?? 0),
    videoMinutesAllTime: Number(matchStats?.minutesAllTime ?? 0),
    gameplansAllTime: Number(gameplanStats?.allTime ?? 0),
    opponentsScoutedAllTime: Number(matchStats?.opponentsAllTime ?? 0),
  }
}

export const FREE_MONTHLY_VIDEO_LIMIT = 5

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


async function getMonthlyVideoCount(userId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [row] = await db
    .select({ total: count() })
    .from(videos)
    .where(and(
      eq(videos.userId, userId),
      ne(videos.status, 'failed'),
      gte(videos.uploadedAt, startOfMonth),
    ))

  return row?.total ?? 0
}

export async function checkMonthlyLimit(userId: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const tier = await getSubscriptionStatus(userId)

  // Pro and trial have no monthly cap
  if (tier === 'pro' || tier === 'trial') {
    const used = await getMonthlyVideoCount(userId)
    return { allowed: true, used, limit: Infinity }
  }

  const used = await getMonthlyVideoCount(userId)
  if (used >= FREE_MONTHLY_VIDEO_LIMIT) notifyCapReached(userId).catch(() => {})
  return { allowed: used < FREE_MONTHLY_VIDEO_LIMIT, used, limit: FREE_MONTHLY_VIDEO_LIMIT }
}

// Sends the "cap hit" upgrade nudge once per calendar month — gated on
// cap_email_sent_at so repeated blocked attempts don't spam the user.
async function notifyCapReached(userId: string) {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const [user] = await db.select({ email: users.email, capEmailSentAt: users.capEmailSentAt }).from(users).where(eq(users.id, userId))
  if (!user || user.email.endsWith('@unknown.local')) return
  if (user.capEmailSentAt && user.capEmailSentAt >= startOfMonth) return

  await db.update(users).set({ capEmailSentAt: new Date() }).where(eq(users.id, userId))
  await sendCapReachedEmail(user.email, FREE_MONTHLY_VIDEO_LIMIT)
}
