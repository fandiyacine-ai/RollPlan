import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { canonicalTournaments, tournaments } from '../lib/db/schema'
import { and, eq, isNull, lt, not, sql } from 'drizzle-orm'
import { scrapeUpcomingCompetitions } from '../lib/smoothcomp/scraper'

// Heuristic: derive ruleset from event name for Smoothcomp events
function deriveRuleset(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes('adcc')) return 'adcc'
  if (lower.includes('ebi') || lower.includes('combat jiu-jitsu')) return 'ebi'
  if (lower.includes('ajp') || lower.includes('abu dhabi grand slam')) return 'ajp'
  return 'ibjjf'  // default for standard BJJ events
}

// Parse various date strings from Smoothcomp into ISO YYYY-MM-DD
function parseScDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {}
  return null
}

export const syncTournamentCatalog = inngest.createFunction(
  {
    id: 'sync-tournament-catalog',
    name: 'Sync Tournament Catalog',
    concurrency: { limit: 1 },
    triggers: [
      { cron: '0 3 * * *' },              // 3 AM UTC daily
      { event: 'tournament-catalog/sync' }, // manual trigger for testing
    ],
  },
  async ({ step }: { step: any }) => {
    const scrapedEvents = await step.run('scrape-smoothcomp', async () => {
      return scrapeUpcomingCompetitions('jiu-jitsu')
    })

    const today = new Date().toISOString().slice(0, 10)
    let upserted = 0
    let skipped = 0

    await step.run('upsert-events', async () => {
      for (const event of scrapedEvents.slice(0, 300)) {
        if (!event.eventId || !event.name?.trim()) { skipped++; continue }

        const parsedDate = parseScDate(event.date)
        // Skip past events that Smoothcomp didn't filter out
        if (parsedDate && parsedDate < today) { skipped++; continue }

        const existing = await db
          .select({ id: canonicalTournaments.id })
          .from(canonicalTournaments)
          .where(eq(canonicalTournaments.smoothcompEventId, event.eventId))
          .limit(1)

        if (existing.length > 0) {
          await db
            .update(canonicalTournaments)
            .set({
              name: event.name.trim(),
              eventDate: parsedDate,
              location: event.location?.trim() ?? null,
              updatedAt: new Date(),
            })
            .where(eq(canonicalTournaments.id, existing[0].id))
        } else {
          await db.insert(canonicalTournaments).values({
            name: event.name.trim(),
            eventDate: parsedDate,
            location: event.location?.trim() ?? null,
            ruleset: deriveRuleset(event.name),
            source: 'smoothcomp',
            smoothcompUrl: event.url,
            smoothcompEventId: event.eventId,
          })
        }
        upserted++
      }
    })

    // Remove stale Smoothcomp events: past date, no user has linked them
    const deleted = await step.run('cleanup-stale', async () => {
      // Subquery: canonical IDs referenced by any tournament
      const referencedIds = db
        .select({ id: tournaments.canonicalTournamentId })
        .from(tournaments)
        .where(not(isNull(tournaments.canonicalTournamentId)))

      const result = await db
        .delete(canonicalTournaments)
        .where(
          and(
            eq(canonicalTournaments.source, 'smoothcomp'),
            lt(canonicalTournaments.eventDate, today),
            not(sql`${canonicalTournaments.id} = ANY(${referencedIds})`),
          ),
        )
        .returning({ id: canonicalTournaments.id })

      return result.length
    })

    return { upserted, skipped, deleted }
  },
)
