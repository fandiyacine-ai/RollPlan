import { db } from '.'
import { users, connections, tournamentOpponents, tournaments } from './schema'
import { eq, and, or, ne, isNotNull, inArray } from 'drizzle-orm'
import { createNotification } from './notifications'
import { sendConnectionRequestEmail, sendConnectionAcceptedEmail } from '../email/send'

export type EligibleConnection = {
  tournamentId: string
  tournamentName: string
  opponentUserId: string
  opponentLabel: string
  result: string // 'win' | 'loss' | 'draw'
}

// Looks up the name a user calls another athlete by — the opponentLabel from
// their own scouting record — so notifications use a name the recipient will
// actually recognize, rather than guessing at a display name.
export async function labelKnownTo(viewerUserId: string, athleteId: string): Promise<string | null> {
  const row = await db
    .select({ opponentLabel: tournamentOpponents.opponentLabel })
    .from(tournamentOpponents)
    .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
    .where(and(
      eq(tournaments.userId, viewerUserId),
      eq(tournamentOpponents.smoothcompAthleteId, athleteId),
    ))
    .limit(1)
  return row[0]?.opponentLabel ?? null
}

// Finds RollPlan users the given user has a *confirmed* head-to-head result
// against (see syncBracketResultsForTournament — never inferred from a shared
// division alone), who are also opted in to connections, and who don't already
// have a connection (in any state — pending, accepted, declined, blocked) with
// this user. This confirmed result is the trust anchor for the whole feature.
export async function findEligibleConnections(userId: string): Promise<EligibleConnection[]> {
  const faced = await db
    .select({
      tournamentId: tournamentOpponents.tournamentId,
      tournamentName: tournaments.name,
      opponentLabel: tournamentOpponents.opponentLabel,
      smoothcompAthleteId: tournamentOpponents.smoothcompAthleteId,
      result: tournamentOpponents.userResult,
    })
    .from(tournamentOpponents)
    .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
    .where(and(
      eq(tournaments.userId, userId),
      isNotNull(tournamentOpponents.userResult),
      isNotNull(tournamentOpponents.smoothcompAthleteId),
    ))
  if (faced.length === 0) return []

  const athleteIds = [...new Set(faced.map(f => f.smoothcompAthleteId).filter((id): id is string => !!id))]

  const opponentUsers = await db
    .select({ id: users.id, smoothcompAthleteId: users.smoothcompAthleteId })
    .from(users)
    .where(and(
      inArray(users.smoothcompAthleteId, athleteIds),
      eq(users.openToConnections, true),
      ne(users.id, userId),
    ))
  if (opponentUsers.length === 0) return []

  const opponentByAthleteId = new Map(opponentUsers.map(u => [u.smoothcompAthleteId!, u.id]))
  const opponentIds = opponentUsers.map(u => u.id)

  const existing = await db
    .select({ requesterId: connections.requesterId, recipientId: connections.recipientId })
    .from(connections)
    .where(or(
      and(eq(connections.requesterId, userId), inArray(connections.recipientId, opponentIds)),
      and(eq(connections.recipientId, userId), inArray(connections.requesterId, opponentIds)),
    ))
  const alreadyLinked = new Set(existing.flatMap(c => [c.requesterId, c.recipientId]).filter(id => id !== userId))

  const seen = new Set<string>()
  const results: EligibleConnection[] = []
  for (const f of faced) {
    if (!f.smoothcompAthleteId || !f.result) continue
    const opponentUserId = opponentByAthleteId.get(f.smoothcompAthleteId)
    if (!opponentUserId || alreadyLinked.has(opponentUserId) || seen.has(opponentUserId)) continue
    seen.add(opponentUserId)
    results.push({
      tournamentId: f.tournamentId,
      tournamentName: f.tournamentName,
      opponentUserId,
      opponentLabel: f.opponentLabel,
      result: f.result,
    })
  }
  return results
}

export async function sendConnectionRequest(requesterId: string, recipientId: string, tournamentId: string): Promise<{ error?: string }> {
  if (requesterId === recipientId) return { error: 'You cannot connect with yourself' }

  const recipient = await db.query.users.findFirst({ where: eq(users.id, recipientId) })
  if (!recipient || !recipient.openToConnections) return { error: 'This competitor is not open to connections' }

  // Re-derive eligibility server-side rather than trusting the client — the
  // confirmed head-to-head result is the only thing that justifies a request.
  const eligible = await findEligibleConnections(requesterId)
  const match = eligible.find(e => e.opponentUserId === recipientId && e.tournamentId === tournamentId)
  if (!match) return { error: 'No confirmed match found against this competitor' }

  const requester = await db.query.users.findFirst({ where: eq(users.id, requesterId) })
  if (!requester?.smoothcompAthleteId) return { error: 'Could not verify your athlete identity' }

  await db.insert(connections).values({ requesterId, recipientId, tournamentId, status: 'pending' })

  const nameForRecipient = (await labelKnownTo(recipientId, requester.smoothcompAthleteId)) ?? 'A competitor you faced'
  await createNotification(
    recipientId,
    'connection_request',
    `${nameForRecipient} wants to connect`,
    `You faced them at ${match.tournamentName} — accept to see each other's upcoming tournaments and competition record. Your scouting and prep stay private either way.`,
    '/connections',
  )
  if (recipient.email && !recipient.email.endsWith('@unknown.local')) {
    await sendConnectionRequestEmail(recipient.email, nameForRecipient, match.tournamentName).catch(() => {})
  }

  return {}
}

export async function respondToConnectionRequest(connectionId: string, recipientId: string, accept: boolean): Promise<{ error?: string }> {
  const connection = await db.query.connections.findFirst({ where: eq(connections.id, connectionId) })
  if (!connection || connection.recipientId !== recipientId) return { error: 'Connection request not found' }
  if (connection.status !== 'pending') return { error: 'This request has already been handled' }

  await db.update(connections)
    .set({ status: accept ? 'accepted' : 'declined', respondedAt: new Date() })
    .where(eq(connections.id, connectionId))

  // Decline is silent by design (see ROADMAP) — the requester is never told
  // whether they were declined or simply ignored, sparing a visible rejection.
  if (!accept) return {}

  const [requester, recipient] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, connection.requesterId) }),
    db.query.users.findFirst({ where: eq(users.id, connection.recipientId) }),
  ])
  if (!requester || !recipient) return {}

  const [nameForRequester, nameForRecipient] = await Promise.all([
    recipient.smoothcompAthleteId ? labelKnownTo(connection.requesterId, recipient.smoothcompAthleteId) : null,
    requester.smoothcompAthleteId ? labelKnownTo(connection.recipientId, requester.smoothcompAthleteId) : null,
  ])

  await createNotification(
    connection.requesterId,
    'connection_accepted',
    `You and ${nameForRequester ?? 'your opponent'} are connected!`,
    `You can now see each other's upcoming tournaments and competition record. Your scouting and prep stay private.`,
    '/connections',
  )
  await createNotification(
    connection.recipientId,
    'connection_accepted',
    `You and ${nameForRecipient ?? 'your opponent'} are connected!`,
    `You can now see each other's upcoming tournaments and competition record. Your scouting and prep stay private.`,
    '/connections',
  )
  if (requester.email && !requester.email.endsWith('@unknown.local')) {
    await sendConnectionAcceptedEmail(requester.email, nameForRequester ?? 'your opponent').catch(() => {})
  }
  if (recipient.email && !recipient.email.endsWith('@unknown.local')) {
    await sendConnectionAcceptedEmail(recipient.email, nameForRecipient ?? 'your opponent').catch(() => {})
  }

  return {}
}

// Basic blocking — some competitors are rivals with real beef. Blocking closes
// out any existing request (in either direction) and prevents future ones;
// the findEligibleConnections "alreadyLinked" check treats any connection row,
// regardless of status, as a closed door.
export async function blockUser(userId: string, otherUserId: string): Promise<{ error?: string }> {
  if (userId === otherUserId) return { error: 'Invalid request' }

  const existing = await db.query.connections.findFirst({
    where: or(
      and(eq(connections.requesterId, userId), eq(connections.recipientId, otherUserId)),
      and(eq(connections.requesterId, otherUserId), eq(connections.recipientId, userId)),
    ),
  })

  if (existing) {
    await db.update(connections).set({ status: 'blocked', respondedAt: new Date() }).where(eq(connections.id, existing.id))
  } else {
    await db.insert(connections).values({ requesterId: userId, recipientId: otherUserId, status: 'blocked', respondedAt: new Date() })
  }
  return {}
}
