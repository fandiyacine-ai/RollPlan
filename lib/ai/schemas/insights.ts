import { z } from 'zod'
import { CONCEPT_IDS } from '../../taxonomy/concepts'

const InsightSchema = z.object({
  category: z.enum(['strength', 'mistake', 'opportunity', 'pattern']),
  severity: z.enum(['critical', 'moderate', 'minor']),
  description: z.string().min(10),
  suggestion: z.string().min(10),
  concept_tags: z.array(z.enum(CONCEPT_IDS)).min(1),
  evidence_segment_ids: z.array(z.string()),
  evidence_event_ids: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  youtube_search_query: z.string().optional().describe('Short YouTube search query to find a tutorial for the suggested technique (e.g. "deep half guard entries BJJ tutorial")'),
}).refine(
  d => d.evidence_segment_ids.length > 0 || d.evidence_event_ids.length > 0,
  { message: 'Every insight must reference at least one evidence_segment_id or evidence_event_id' }
)

export const InsightsOutputSchema = z.object({
  insights: z.array(InsightSchema).min(1).max(8),
})

export type InsightsOutput = z.infer<typeof InsightsOutputSchema>
export type Insight = z.infer<typeof InsightSchema>
