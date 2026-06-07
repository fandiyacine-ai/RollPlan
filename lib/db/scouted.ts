import { db } from '.'
import { users, tournamentOpponents, tournaments } from './schema'
import { eq, and, ne, inArray, countDistinct } from 'drizzle-orm'
import { createNotification } from './notifications'
import { sendScoutedEmail } from '../email/send'

// Notifies athletes when another RollPlan user scouts them (adds them as a
// tournament opponent with a matching Smoothcomp athlete ID). Counts distinct
// scouters — not raw rows — so re-imports/syncs don't inflate the number.
// Gated on scoutedNotifiedCount so each athlete is only notified on net-new
// increases, mirroring the cap-email-sent-at pattern.
export async function notifyScoutedAthletes(scouterUserId: string, smoothcompAthleteIds: (string | null | undefined)[]) {
  const ids = [...new Set(smoothcompAthleteIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return

  const scoutedUsers = await db
    .select({ id: users.id, email: users.email, smoothcompAthleteId: users.smoothcompAthleteId, scoutedNotifiedCount: users.scoutedNotifiedCount })
    .from(users)
    .where(and(
      inArray(users.smoothcompAthleteId, ids),
      ne(users.id, scouterUserId),
    ))

  for (const user of scoutedUsers) {
    if (!user.smoothcompAthleteId || user.email.endsWith('@unknown.local')) continue

    const [{ count: liveCount }] = await db
      .select({ count: countDistinct(tournaments.userId) })
      .from(tournamentOpponents)
      .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
      .where(and(
        eq(tournamentOpponents.smoothcompAthleteId, user.smoothcompAthleteId),
        ne(tournaments.userId, user.id),
      ))

    const count = Number(liveCount)
    if (count <= user.scoutedNotifiedCount) continue

    await db.update(users).set({ scoutedNotifiedCount: count }).where(eq(users.id, user.id))
    await createNotification(
      user.id,
      'scouted',
      `Someone's scouting you 👀`,
      `You've now been scouted ${count} time${count === 1 ? '' : 's'} on RollPlan.`,
    )
    await sendScoutedEmail(user.email, count).catch(() => {})
  }
}
