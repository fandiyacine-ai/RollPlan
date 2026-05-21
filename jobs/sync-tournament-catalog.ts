import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { canonicalTournaments, tournaments } from '../lib/db/schema'
import { and, eq, ilike, isNull, lt, not, or, sql } from 'drizzle-orm'
import { scrapeUpcomingCompetitions, scrapeIbjjfEvents, scrapeAjpEvents } from '../lib/smoothcomp/scraper'

type ScrapedEvent = { name: string; eventId: string; url: string; date: string | null; location: string | null }

// Derive ruleset from event name (used for Smoothcomp events whose ruleset isn't known)
function deriveRuleset(name: string): string {
  const l = name.toLowerCase()
  if (l.includes('adcc')) return 'adcc'
  if (l.includes('ebi') || l.includes('combat jiu-jitsu')) return 'ebi'
  if (l.includes('ajp') || l.includes('abu dhabi grand slam')) return 'ajp'
  return 'ibjjf'
}

// Normalise various date string formats → ISO YYYY-MM-DD, or null
function parseEventDate(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw.trim()
  try {
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {}
  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{4})/)
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return null
}

// Returns true for our synthetic placeholder IDs (ajp-*, ibjjf-*) vs real Smoothcomp numeric IDs.
function isSyntheticId(id: string | null): boolean {
  return !id || id.startsWith('ajp-') || id.startsWith('ibjjf-')
}

// Upsert a single event.
// Dedup strategy (in priority order):
//   1. Match by smoothcompEventId    — catches re-scrapes of the same event
//   2. Match by source + name        — merges scraped events with manually seeded rows
//   3. Match by name + date (cross-source) — prevents duplicates when the same event
//      appears on both an official website (AJP/IBJJF) AND Smoothcomp
async function upsertEvent(
  event: ScrapedEvent,
  source: string,
  today: string,
): Promise<void> {
  const parsedDate = parseEventDate(event.date)
  if (parsedDate && parsedDate < today) return  // skip past events

  // Lookup 1: by eventId (stable across re-scrapes)
  let existing = await db
    .select({ id: canonicalTournaments.id, smoothcompEventId: canonicalTournaments.smoothcompEventId })
    .from(canonicalTournaments)
    .where(eq(canonicalTournaments.smoothcompEventId, event.eventId))
    .limit(1)

  // Lookup 2: seeded row with no eventId yet — match by source + exact name
  if (existing.length === 0) {
    existing = await db
      .select({ id: canonicalTournaments.id, smoothcompEventId: canonicalTournaments.smoothcompEventId })
      .from(canonicalTournaments)
      .where(and(
        eq(canonicalTournaments.source, source),
        ilike(canonicalTournaments.name, event.name),
        isNull(canonicalTournaments.smoothcompEventId),
      ))
      .limit(1)
  }

  // Lookup 3: cross-source duplicate — same name + same date on a different source
  // (e.g. "AJP Grand Slam London" scraped from ajptour.com and also found on Smoothcomp)
  if (existing.length === 0 && parsedDate) {
    existing = await db
      .select({ id: canonicalTournaments.id, smoothcompEventId: canonicalTournaments.smoothcompEventId })
      .from(canonicalTournaments)
      .where(and(
        ilike(canonicalTournaments.name, event.name.trim()),
        eq(canonicalTournaments.eventDate, parsedDate),
      ))
      .limit(1)
  }

  // Lookup 4: same federation + same date — catches name mismatches between seeded rows
  // and scraped rows (e.g. "IBJJF World Championship 2026" vs "IBJJF World Jiu-Jitsu Championship 2026")
  if (existing.length === 0 && parsedDate && (source === 'ibjjf' || source === 'ajp')) {
    existing = await db
      .select({ id: canonicalTournaments.id, smoothcompEventId: canonicalTournaments.smoothcompEventId })
      .from(canonicalTournaments)
      .where(and(
        eq(canonicalTournaments.source, source),
        eq(canonicalTournaments.eventDate, parsedDate),
      ))
      .limit(1)
  }

  if (existing.length > 0) {
    const existingEventId = existing[0].smoothcompEventId
    // Upgrade synthetic placeholder IDs (ajp-*, ibjjf-*) to a real Smoothcomp numeric ID,
    // but never overwrite a real ID with a synthetic one.
    const upgradeId = isSyntheticId(existingEventId) && !isSyntheticId(event.eventId)
    const newEventId = upgradeId ? event.eventId : (existingEventId ?? event.eventId)

    const baseUpdate = {
      name: event.name.trim(),
      eventDate: parsedDate,
      location: event.location?.trim() ?? null,
      smoothcompEventId: newEventId,
      updatedAt: new Date(),
    }

    await db.update(canonicalTournaments).set(
      upgradeId && source === 'smoothcomp'
        ? { ...baseUpdate, smoothcompUrl: event.url }
        : baseUpdate,
    ).where(eq(canonicalTournaments.id, existing[0].id))
  } else {
    await db.insert(canonicalTournaments).values({
      name: event.name.trim(),
      eventDate: parsedDate,
      location: event.location?.trim() ?? null,
      ruleset: source === 'smoothcomp' ? deriveRuleset(event.name) : source,
      source,
      smoothcompUrl: source === 'smoothcomp' ? event.url : null,
      smoothcompEventId: event.eventId,
    }).onConflictDoNothing()
  }
}

export const syncTournamentCatalog = inngest.createFunction(
  {
    id: 'sync-tournament-catalog',
    name: 'Sync Tournament Catalog',
    concurrency: { limit: 1 },
    triggers: [
      { cron: '0 3 * * *' },               // 3 AM UTC daily
      { event: 'tournament-catalog/sync' }, // manual trigger
    ],
  },
  async ({ step }: { step: any }) => {
    const today = new Date().toISOString().slice(0, 10)

    // Run three scrapers sequentially — each in its own step so failures are
    // tracked independently and don't block the others
    const scEvents: ScrapedEvent[] = await step.run('scrape-smoothcomp', async () => {
      return scrapeUpcomingCompetitions('jiu-jitsu').catch(() => [] as ScrapedEvent[])
    })

    const ibjjfEvents: ScrapedEvent[] = await step.run('scrape-ibjjf', async () => {
      return scrapeIbjjfEvents().catch(() => [] as ScrapedEvent[])
    })

    const ajpEvents: ScrapedEvent[] = await step.run('scrape-ajp', async () => {
      return scrapeAjpEvents().catch(() => [] as ScrapedEvent[])
    })

    const counts = { smoothcomp: 0, ibjjf: 0, ajp: 0 }

    await step.run('upsert-smoothcomp', async () => {
      for (const ev of scEvents.slice(0, 300)) {
        if (!ev.eventId || !ev.name?.trim()) continue
        await upsertEvent(ev, 'smoothcomp', today)
        counts.smoothcomp++
      }
    })

    await step.run('upsert-ibjjf', async () => {
      for (const ev of ibjjfEvents.slice(0, 200)) {
        if (!ev.eventId || !ev.name?.trim()) continue
        await upsertEvent(ev, 'ibjjf', today)
        counts.ibjjf++
      }
    })

    await step.run('upsert-ajp', async () => {
      for (const ev of ajpEvents.slice(0, 200)) {
        if (!ev.eventId || !ev.name?.trim()) continue
        await upsertEvent(ev, 'ajp', today)
        counts.ajp++
      }
    })

    // Remove past events from ALL scraped sources (have a smoothcompEventId) that
    // no user has linked to a tournament. Manually seeded rows (smoothcompEventId IS NULL)
    // are never auto-deleted.
    const deleted: number = await step.run('cleanup-stale', async () => {
      const referencedIds = db
        .select({ id: tournaments.canonicalTournamentId })
        .from(tournaments)
        .where(not(isNull(tournaments.canonicalTournamentId)))

      const rows = await db
        .delete(canonicalTournaments)
        .where(and(
          not(isNull(canonicalTournaments.smoothcompEventId)),
          lt(canonicalTournaments.eventDate, today),
          not(sql`${canonicalTournaments.id} = ANY(${referencedIds})`),
        ))
        .returning({ id: canonicalTournaments.id })

      return rows.length
    })

    return { scraped: counts, deleted }
  },
)
