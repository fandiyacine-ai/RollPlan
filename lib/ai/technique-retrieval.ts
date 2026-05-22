import { db } from '../db'
import { techniqueVariants } from '../db/schema'
import { eq, and, or, inArray } from 'drizzle-orm'

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

// Fetch active variants for match analysis — filtered by gi/no_gi format
export async function getTechniqueVariantsForAnalysis(
  format: 'gi' | 'no_gi'
): Promise<TechniqueVariant[]> {
  return db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      or(eq(techniqueVariants.format, format), eq(techniqueVariants.format, 'both'))
    ),
    columns: {
      id: true, eventId: true, positionId: true, name: true, format: true,
      visualCues: true, counters: true, referenceImageUrl: true,
    },
  })
}

// Fetch variants for specific event IDs — used by chat and gameplans
export async function getTechniqueVariantsByEvents(
  eventIds: string[],
  format: 'gi' | 'no_gi' | 'both' = 'both'
): Promise<TechniqueVariant[]> {
  if (eventIds.length === 0) return []
  return db.query.techniqueVariants.findMany({
    where: and(
      eq(techniqueVariants.status, 'active'),
      inArray(techniqueVariants.eventId, eventIds),
      format === 'both'
        ? undefined
        : or(eq(techniqueVariants.format, format), eq(techniqueVariants.format, 'both'))
    ),
    columns: {
      id: true, eventId: true, positionId: true, name: true, format: true,
      visualCues: true, counters: true, referenceImageUrl: true,
    },
  })
}

// Format variants as a prompt block for injection into system prompts
export function formatVariantsAsPromptBlock(variants: TechniqueVariant[]): string {
  if (variants.length === 0) return ''

  const grouped = new Map<string, TechniqueVariant[]>()
  for (const v of variants) {
    const key = v.eventId
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(v)
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

  return `## Technique Visual Reference Library\n\nThe following are expert-extracted descriptions of BJJ techniques. Use these as visual detection guides when watching match footage.\n\n${sections.join('\n\n---\n\n')}`
}

// Format variants as counter guide — for gameplans and chat
export function formatVariantsAsCounterGuide(variants: TechniqueVariant[]): string {
  const withCounters = variants.filter(v => v.counters)
  if (withCounters.length === 0) return ''

  const lines = withCounters.map(v =>
    `**${v.name}**: ${v.counters}`
  )

  return `## Known Technique Counters\n\n${lines.join('\n\n')}`
}
