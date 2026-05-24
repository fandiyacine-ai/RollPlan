import { db } from '../db'
import { techniqueVariants } from '../db/schema'
import { eq, and, or, inArray, isNull, not } from 'drizzle-orm'

export type TechniqueVariant = {
  id: string
  eventId: string
  positionId: string | null
  name: string
  format: string
  visualCues: string
  counters: string | null
  referenceImageUrl: string | null
  sourceUrl: string | null
  sourceLabel: string | null
}

const FORMAT_FILTER = (format: 'gi' | 'no_gi') =>
  or(eq(techniqueVariants.format, format), eq(techniqueVariants.format, 'both'))

const COLS = {
  id: true, eventId: true, positionId: true, name: true, format: true,
  visualCues: true, counters: true, referenceImageUrl: true,
  sourceUrl: true, sourceLabel: true,
} as const

// ─── Extraction (first Gemini pass) ──────────────────────────────────────────
// All active variants (general + position-specific), format-filtered.
// General variants (positionId IS NULL) appear first so they anchor the model's
// pattern recognition before position-specific details follow.
// Cap raised to 25 — KB is now large enough that capping too low starves Gemini.
const EXTRACTION_CAP = 25

export async function getTechniqueVariantsForExtraction(
  format: 'gi' | 'no_gi'
): Promise<TechniqueVariant[]> {
  // Fetch general variants first (positionId IS NULL), then position-specific
  const general = await db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      FORMAT_FILTER(format),
      isNull(techniqueVariants.positionId)
    ),
    columns: COLS,
    limit: EXTRACTION_CAP,
  })
  const specific = await db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      FORMAT_FILTER(format),
      not(isNull(techniqueVariants.positionId))
    ),
    columns: COLS,
    limit: EXTRACTION_CAP - general.length,
  })
  return [...general, ...specific]
}

// ─── Targeted rescan (Phase 2 — after positions are known) ───────────────────
// Fetch variants for positions that ACTUALLY APPEARED in this match, plus general
// variants (positionId IS NULL) so the model always has universal context.
// Cap raised to 30 — KB is now large enough to warrant deeper injection.
const RESCAN_CAP = 30

export async function getTechniqueVariantsForPositions(
  positionIds: string[],   // positions extracted from the match
  format: 'gi' | 'no_gi'
): Promise<TechniqueVariant[]> {
  if (positionIds.length === 0) return []

  const uniquePositions = [...new Set(positionIds)]

  const rows = await db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      FORMAT_FILTER(format),
      or(isNull(techniqueVariants.positionId), inArray(techniqueVariants.positionId, uniquePositions))
    ),
    columns: COLS,
    limit: RESCAN_CAP,
  })
  return rows
}

// ─── Chat + gameplans (event-ID based) ───────────────────────────────────────
// Fetch variants for specific technique IDs that were observed in the match.
// Used after analysis when we know what events occurred.
const CHAT_CAP = 25

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
