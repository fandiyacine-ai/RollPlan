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
    // Split into tokens so "Estonia AJP" matches "AJP Estonia 2026" (order-independent)
    const tokens = query.trim().split(/\s+/).filter(t => t.length >= 2)

    // Each token must appear in name OR location (AND across tokens)
    const tokenFilters = tokens.map(t =>
      or(
        ilike(canonicalTournaments.name, `%${t}%`),
        ilike(canonicalTournaments.location, `%${t}%`),
      )
    )

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
          or(isNull(canonicalTournaments.eventDate), gte(canonicalTournaments.eventDate, today)),
          tokenFilters.length > 0 ? and(...tokenFilters) : undefined,
        ),
      )
      .groupBy(canonicalTournaments.id)
      .orderBy(asc(canonicalTournaments.eventDate))
      .limit(20)

    return rows as CatalogEntry[]
  } catch {
    return []
  }
}
