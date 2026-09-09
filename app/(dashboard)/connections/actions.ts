'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { users, connections, tournaments } from '@/lib/db/schema'
import { eq, and, or, gte, asc, inArray } from 'drizzle-orm'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import {
  findEligibleConnections,
  sendConnectionRequest,
  respondToConnectionRequest,
  blockUser,
  labelKnownTo,
  type EligibleConnection,
} from '@/lib/db/connections'

export type ConnectionCandidate = EligibleConnection

export type PendingRequest = {
  connectionId: string
  fromLabel: string
  fromUserId: string
  tournamentName: string | null
  createdAt: Date
}

export type ConnectionRecord = {
  connectionId: string
  otherUserId: string
  otherLabel: string
  upcomingTournaments: { id: string; name: string; eventDate: string | null }[]
  record: {
    ajpWins: number | null; ajpLosses: number | null
    smoothcompWins: number | null; smoothcompLosses: number | null
    ibjjfBestResult: string | null
  }
}

export async function getConnectionsPageData(): Promise<{
  candidates: ConnectionCandidate[]
  pendingReceived: PendingRequest[]
  accepted: ConnectionRecord[]
  openToConnections: boolean
}> {
  const userId = await getOrCreateDbUserId()
  const today = new Date().toISOString().slice(0, 10)

  const [me] = await db.select({ openToConnections: users.openToConnections }).from(users).where(eq(users.id, userId)).limit(1)

  const candidates = await findEligibleConnections(userId)

  const rows = await db
    .select({
      id: connections.id,
      requesterId: connections.requesterId,
      recipientId: connections.recipientId,
      status: connections.status,
      createdAt: connections.createdAt,
      tournamentName: tournaments.name,
    })
    .from(connections)
    .leftJoin(tournaments, eq(tournaments.id, connections.tournamentId))
    .where(or(eq(connections.requesterId, userId), eq(connections.recipientId, userId)))

  const pendingRows = rows.filter(r => r.status === 'pending' && r.recipientId === userId)
  const acceptedRows = rows.filter(r => r.status === 'accepted')

  const otherUserIds = [...new Set([
    ...pendingRows.map(r => r.requesterId),
    ...acceptedRows.map(r => (r.requesterId === userId ? r.recipientId : r.requesterId)),
  ])]

  const otherUsers = otherUserIds.length
    ? await db.select({
        id: users.id,
        smoothcompAthleteId: users.smoothcompAthleteId,
        ajpWins: users.ajpWins, ajpLosses: users.ajpLosses,
        smoothcompWins: users.smoothcompWins, smoothcompLosses: users.smoothcompLosses,
        ibjjfBestResult: users.ibjjfBestResult,
      }).from(users).where(inArray(users.id, otherUserIds))
    : []
  const otherUserById = new Map(otherUsers.map(u => [u.id, u]))

  const labels = new Map<string, string>()
  for (const id of otherUserIds) {
    const athleteId = otherUserById.get(id)?.smoothcompAthleteId ?? null
    labels.set(id, (athleteId ? await labelKnownTo(userId, athleteId) : null) ?? 'A competitor you faced')
  }

  const pendingReceived: PendingRequest[] = pendingRows.map(r => ({
    connectionId: r.id,
    fromLabel: labels.get(r.requesterId) ?? 'A competitor you faced',
    fromUserId: r.requesterId,
    tournamentName: r.tournamentName,
    createdAt: r.createdAt,
  }))

  const acceptedOtherIds = acceptedRows.map(r => (r.requesterId === userId ? r.recipientId : r.requesterId))
  const upcomingByUser = new Map<string, { id: string; name: string; eventDate: string | null }[]>()
  if (acceptedOtherIds.length) {
    const upcoming = await db
      .select({ id: tournaments.id, name: tournaments.name, eventDate: tournaments.eventDate, userId: tournaments.userId })
      .from(tournaments)
      .where(and(
        inArray(tournaments.userId, acceptedOtherIds),
        eq(tournaments.status, 'upcoming'),
        gte(tournaments.eventDate, today),
      ))
      .orderBy(asc(tournaments.eventDate))
    for (const t of upcoming) {
      const list = upcomingByUser.get(t.userId) ?? []
      list.push({ id: t.id, name: t.name, eventDate: t.eventDate })
      upcomingByUser.set(t.userId, list)
    }
  }

  const accepted: ConnectionRecord[] = acceptedRows.map(r => {
    const otherUserId = r.requesterId === userId ? r.recipientId : r.requesterId
    const other = otherUserById.get(otherUserId)
    return {
      connectionId: r.id,
      otherUserId,
      otherLabel: labels.get(otherUserId) ?? 'A competitor you faced',
      upcomingTournaments: upcomingByUser.get(otherUserId) ?? [],
      record: {
        ajpWins: other?.ajpWins ?? null, ajpLosses: other?.ajpLosses ?? null,
        smoothcompWins: other?.smoothcompWins ?? null, smoothcompLosses: other?.smoothcompLosses ?? null,
        ibjjfBestResult: other?.ibjjfBestResult ?? null,
      },
    }
  })

  return { candidates, pendingReceived, accepted, openToConnections: me?.openToConnections ?? false }
}

export async function sendConnectionRequestAction(recipientUserId: string, tournamentId: string): Promise<{ error?: string }> {
  const userId = await getOrCreateDbUserId()
  const result = await sendConnectionRequest(userId, recipientUserId, tournamentId)
  if (!result.error) revalidatePath('/connections')
  return result
}

export async function respondToConnectionRequestAction(connectionId: string, accept: boolean): Promise<{ error?: string }> {
  const userId = await getOrCreateDbUserId()
  const result = await respondToConnectionRequest(connectionId, userId, accept)
  if (!result.error) revalidatePath('/connections')
  return result
}

export async function blockUserAction(otherUserId: string): Promise<{ error?: string }> {
  const userId = await getOrCreateDbUserId()
  const result = await blockUser(userId, otherUserId)
  if (!result.error) revalidatePath('/connections')
  return result
}
