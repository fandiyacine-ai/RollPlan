'use server'

import { db } from '@/lib/db'
import { canonicalTournaments, tournaments } from '@/lib/db/schema'
import { and, asc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm'

export type CatalogEntry = {
  id: string
  name: string
  eventDate: string | null
  location: string | null
  ruleset: string
  source: string
  smoothcompUrl: string | null
  userCount: number
}

export async function searchCatalogAction(query: string): Promise<CatalogEntry[]> {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const q = query.trim()

    const rows = await db
      .select({
        id: canonicalTournaments.id,
        name: canonicalTournaments.name,
        eventDate: canonicalTournaments.eventDate,
        location: canonicalTournaments.location,
        ruleset: canonicalTournaments.ruleset,
        source: canonicalTournaments.source,
        smoothcompUrl: canonicalTournaments.smoothcompUrl,
        userCount: sql<number>`count(distinct ${tournaments.id})::int`,
      })
      .from(canonicalTournaments)
      .leftJoin(tournaments, eq(tournaments.canonicalTournamentId, canonicalTournaments.id))
      .where(
        and(
          // Include events with unknown date or future date
          or(
            isNull(canonicalTournaments.eventDate),
            gte(canonicalTournaments.eventDate, today),
          ),
          q ? or(
            ilike(canonicalTournaments.name, `%${q}%`),
            ilike(canonicalTournaments.location, `%${q}%`),
          ) : undefined,
        ),
      )
      .groupBy(canonicalTournaments.id)
      .orderBy(asc(canonicalTournaments.eventDate))
      .limit(10)

    return rows as CatalogEntry[]
  } catch {
    return []
  }
}
