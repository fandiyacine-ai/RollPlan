import { db } from '../db'
import { techniqueVariants } from '../db/schema'
import type { TechniqueVariant } from './technique-retrieval'
import { embedText, cosineSimilarity } from './embeddings'
import { and, eq, or } from 'drizzle-orm'

export type SemanticSearchOptions = {
  format?: 'gi' | 'no_gi' | 'both'
}

const FORMAT_FILTER = (format: 'gi' | 'no_gi') =>
  or(eq(techniqueVariants.format, format), eq(techniqueVariants.format, 'both'))

// Semantic retrieval for technique variants.
// Uses embeddings when possible, with keyword overlap as a fallback.
export async function semanticSearchVariants(query: string, limit = 25, options: SemanticSearchOptions = {}): Promise<TechniqueVariant[]> {
  const whereClause = options.format && options.format !== 'both'
    ? and(eq(techniqueVariants.status, 'active'), FORMAT_FILTER(options.format))
    : eq(techniqueVariants.status, 'active')

  const rows = await db.query.techniqueVariants.findMany({
    where: whereClause,
    columns: {
      id: true,
      eventId: true,
      positionId: true,
      name: true,
      format: true,
      visualCues: true,
      counters: true,
      referenceImageUrl: true,
      sourceUrl: true,
      sourceLabel: true,
      sourceCategory: true,
      searchText: true,
      embedding: true,
    },
  })

  let queryEmbedding: number[] | null = null
  try {
    queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY')
  } catch {
    queryEmbedding = null
  }

  const qterms = query.toLowerCase().split(/\W+/).filter(Boolean)

  const scored = rows.map(row => {
    const fallbackText = (row.searchText ?? row.name).toLowerCase()
    let score = 0
    if (queryEmbedding && row.embedding && Array.isArray(row.embedding)) {
      score = cosineSimilarity(queryEmbedding, row.embedding as number[])
    }
    if (score <= 0) {
      for (const term of qterms) {
        if (fallbackText.includes(term)) score += 1
      }
    }
    return { row, score }
  }).filter(result => result.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(result => result.row)
}
