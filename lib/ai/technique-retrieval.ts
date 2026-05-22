import { db } from '../db'
import { techniqueVariants } from '../db/schema'
import { eq, and, or, inArray, isNull } from 'drizzle-orm'

export type TechniqueVariant = {
  id: string
  eventId: string
  positionId: string | null
  name: string
  format: string
  visualCues: string
  counters: string | null
  referenceImageUrl: string | null
}

const FORMAT_FILTER = (format: 'gi' | 'no_gi') =>
  or(eq(techniqueVariants.format, format), eq(techniqueVariants.format, 'both'))

const COLS = {
  id: true, eventId: true, positionId: true, name: true, format: true,
  visualCues: true, counters: true, referenceImageUrl: true,
} as const

// ─── Extraction (first Gemini pass) ──────────────────────────────────────────
// Only general variants (positionId IS NULL) — truly universal, format-filtered.
// Cap: 15. These are the "always send" flashcards regardless of what positions appear.
// Position-specific variants are reserved for the targeted rescan (Phase 2).
const EXTRACTION_CAP = 15

export async function getTechniqueVariantsForExtraction(
  format: 'gi' | 'no_gi'
): Promise<TechniqueVariant[]> {
  const rows = await db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      FORMAT_FILTER(format),
      isNull(techniqueVariants.positionId)   // general only — no position-specific yet
    ),
    columns: COLS,
    limit: EXTRACTION_CAP,
  })
  return rows
}

// ─── Targeted rescan (Phase 2 — after positions are known) ───────────────────
// Fetch variants whose positionId matches positions that ACTUALLY APPEARED in
// this match. Cap: 20. Called after the first extraction gives us the segment list.
const RESCAN_CAP = 20

export async function getTechniqueVariantsForPositions(
  positionIds: string[],   // positions extracted from the match
  format: 'gi' | 'no_gi'
): Promise<TechniqueVariant[]> {
  if (positionIds.length === 0) return []

  // Deduplicate positions and limit to the most relevant ones
  const uniquePositions = [...new Set(positionIds)]

  const rows = await db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      FORMAT_FILTER(format),
      inArray(techniqueVariants.positionId, uniquePositions)
    ),
    columns: COLS,
    limit: RESCAN_CAP,
  })
  return rows
}

// ─── Chat + gameplans (event-ID based) ───────────────────────────────────────
// Fetch variants for specific technique IDs that were observed in the match.
// Used after analysis when we know what events occurred.
const CHAT_CAP = 20

export async function getTechniqueVariantsByEvents(
  eventIds: string[],
  format: 'gi' | 'no_gi' | 'both' = 'both'
): Promise<TechniqueVariant[]> {
  if (eventIds.length === 0) return []
  const rows = await db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      inArray(techniqueVariants.eventId, eventIds),
      format === 'both' ? undefined : FORMAT_FILTER(format as 'gi' | 'no_gi')
    ),
    columns: COLS,
    limit: CHAT_CAP,
  })
  return rows
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatVariantsAsPromptBlock(variants: TechniqueVariant[]): string {
  if (variants.length === 0) return ''

  const grouped = new Map<string, TechniqueVariant[]>()
  for (const v of variants) {
    if (!grouped.has(v.eventId)) grouped.set(v.eventId, [])
    grouped.get(v.eventId)!.push(v)
  }

  const sections: string[] = []
  for (const [eventId, group] of grouped) {
    const header = `### ${eventId.replace(/_/g, ' ').toUpperCase()}`
    const entries = group.map(v => {
      const label = v.positionId ? `**${v.name}** (from ${v.positionId})` : `**${v.name}**`
      return `${label}\n${v.visualCues}`
    })
    sections.push([header, ...entries].join('\n\n'))
  }

  return `## Technique Visual Reference Library (${variants.length} variants)\n\nExpert-extracted visual descriptions. Use these as detection guides when watching match footage.\n\n${sections.join('\n\n---\n\n')}`
}

export function formatVariantsAsCounterGuide(variants: TechniqueVariant[]): string {
  const withCounters = variants.filter(v => v.counters)
  if (withCounters.length === 0) return ''
  return `## Known Technique Counters\n\n${withCounters.map(v => `**${v.name}**: ${v.counters}`).join('\n\n')}`
}
