import { db } from '.'
import { users, tournamentOpponents, tournaments } from './schema'
import { eq, and, ne, inArray, countDistinct } from 'drizzle-orm'
import { createNotification } from './notifications'
import { sendScoutedEmail } from '../email/send'

// Several voices for the same fact ("you've been scouted N times"), picked at
// random per notification — repeat scoutees (serious competitors) shouldn't
// see the identical line every time. All lean into "this is a compliment, not
// surveillance" — RollPlan's brand voice is competitive respect, not alerts.
function pickScoutedCopy(count: number): { subject: string; title: string; body: string } {
  const s = count === 1 ? '' : 's'
  const variants = [
    {
      subject: `You're on ${count} competitor${s}' radar — here's what to do about it`,
      title: `You're being taken seriously 🎯`,
      body: `${count} competitor${s} added you to their tournament prep — a sign they rate your game enough to study it. Make sure your own scouting is just as sharp before your next match.`,
    },
    {
      subject: `Your reputation on RollPlan is growing`,
      title: `Your reputation is growing`,
      body: `${count} competitor${s} ${count === 1 ? 'has' : 'have'} studied your matches to prep for you. That's the kind of attention that means you're someone to watch — keep building the gap.`,
    },
    {
      subject: `You've been added to ${count} opponent${s}' prep board${s}`,
      title: `You've been added to ${count} opponent${s}' prep board${s}`,
      body: `That means ${count} competitor${s} ${count === 1 ? 'is' : 'are'} studying your matches before facing you — a good sign you're on people's radar. Time to make sure your own prep keeps pace.`,
    },
  ]
  return variants[Math.floor(Math.random() * variants.length)]
}

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

    const copy = pickScoutedCopy(count)
    await db.update(users).set({ scoutedNotifiedCount: count }).where(eq(users.id, user.id))
    await createNotification(user.id, 'scouted', copy.title, copy.body)
    await sendScoutedEmail(user.email, copy).catch(() => {})
  }
}
