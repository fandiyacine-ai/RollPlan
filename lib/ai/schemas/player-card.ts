import { z } from 'zod'

const PositionStatSchema = z.object({
  position_id: z.string(),
  total_seconds: z.number(),
  percentage: z.number(),
  role_split: z.object({ top: z.number(), bottom: z.number(), neutral: z.number() }),
})

const AttackStatSchema = z.object({
  event_type_id: z.string(),
  attempts: z.number(),
  successes: z.number(),
  success_rate: z.number(),
  evidence_event_ids: z.array(z.string()).min(1),
})

export const PlayerCardOutputSchema = z.object({
  preferred_positions: z.array(PositionStatSchema),
  top_attacks: z.array(AttackStatSchema),
  common_mistakes: z.array(z.object({
    description: z.string(),
    frequency: z.number(),
    concept_tags: z.array(z.string()),
    evidence_segment_ids: z.array(z.string()),
    evidence_event_ids: z.array(z.string()),
  })),
  narrative_summary: z.string(),
  top_strengths: z.tuple([z.string(), z.string(), z.string()]),
  top_weaknesses: z.tuple([z.string(), z.string(), z.string()]),
  x_factor: z.string(),
  evidence: z.object({
    match_ids: z.array(z.string()),
    segment_ids: z.array(z.string()),
    event_ids: z.array(z.string()),
  }),
})

export type PlayerCardOutput = z.infer<typeof PlayerCardOutputSchema>
