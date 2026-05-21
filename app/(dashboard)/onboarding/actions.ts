'use server'

import { db } from '@/lib/db'
import { users, tournaments } from '@/lib/db/schema'
import { and, eq, gte, sql } from 'drizzle-orm'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { createTournament } from '../tournaments/actions'
import { addOpponent, submitScoutUrls } from '../tournaments/[id]/opponents/actions'

export async function getPreparingStats(): Promise<{ athleteCount: number }> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const [row] = await db
      .select({ count: sql<number>`count(distinct ${tournaments.userId})::int` })
      .from(tournaments)
      .where(and(eq(tournaments.status, 'upcoming'), gte(tournaments.eventDate, today)))
    return { athleteCount: row?.count ?? 0 }
  } catch {
    return { athleteCount: 0 }
  }
}

export async function completeOnboarding() {
  const userId = await getOrCreateDbUserId()
  await db.update(users).set({ onboardingComplete: 'true' }).where(eq(users.id, userId))
}

export async function onboardingCreateTournament(formData: FormData) {
  return createTournament(formData)
}

export async function onboardingAddOpponent(tournamentId: string, name: string) {
  const fd = new FormData()
  fd.append('name', name)
  fd.append('force', 'true')
  await addOpponent(tournamentId, fd)

  const { db: dbClient } = await import('@/lib/db')
  const { tournamentOpponents } = await import('@/lib/db/schema')
  const { eq, desc } = await import('drizzle-orm')

  const [opp] = await dbClient
    .select({ id: tournamentOpponents.id })
    .from(tournamentOpponents)
    .where(eq(tournamentOpponents.tournamentId, tournamentId))
    .orderBy(desc(tournamentOpponents.createdAt))
    .limit(1)

  return opp?.id ?? null
}

export async function onboardingSubmitFootage(tournamentId: string, opponentId: string, url: string, format: string) {
  const fd = new FormData()
  fd.append('urls', url)
  fd.append('format', format)
  await submitScoutUrls(tournamentId, opponentId, fd)
}
