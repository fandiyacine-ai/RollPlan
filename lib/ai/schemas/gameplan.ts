import { z } from 'zod'

const PlanItemSchema = z.object({
  claim: z.string().min(10),
  your_evidence: z.object({
    description: z.string(),
    segment_ids: z.array(z.string()),
    event_ids: z.array(z.string()),
  }),
  opponent_evidence: z.object({
    description: z.string(),
    segment_ids: z.array(z.string()),
    event_ids: z.array(z.string()),
  }),
  confidence: z.number().min(0).max(1),
}).refine(
  d => d.your_evidence.segment_ids.length > 0 || d.your_evidence.event_ids.length > 0 ||
       d.opponent_evidence.segment_ids.length > 0 || d.opponent_evidence.event_ids.length > 0,
  { message: 'Every plan item must reference at least one evidence ID from either player' }
)

const DrillItemSchema = z.object({
  week: z.number().min(1).max(3),
  drill_description: z.string(),
  rationale: z.string(),
  target_concept_tags: z.array(z.string()),
  evidence_segment_ids: z.array(z.string()),
  evidence_event_ids: z.array(z.string()),
})

export const GameplanOutputSchema = z.object({
  your_advantages: z.array(PlanItemSchema).min(1).max(5),
  their_threats: z.array(PlanItemSchema).min(1).max(5),
  recommended_strategy: z.array(PlanItemSchema).min(1).max(5),
  drill_priorities: z.array(DrillItemSchema).min(1).max(9),
  evidence: z.object({
    user_match_ids: z.array(z.string()),
    opponent_match_ids: z.array(z.string()),
  }),
})

export type GameplanOutput = z.infer<typeof GameplanOutputSchema>
export type PlanItem = z.infer<typeof PlanItemSchema>
export type DrillItem = z.infer<typeof DrillItemSchema>
