import { z } from 'zod'
import { POSITION_IDS } from '../../taxonomy/positions'
import { EVENT_TYPE_IDS } from '../../taxonomy/events'

export const PositionSegmentSchema = z.object({
  start_seconds: z.number().min(0),
  end_seconds: z.number().min(0),
  position_id: z.enum(POSITION_IDS),
  user_role: z.enum(['top', 'bottom', 'neutral', 'standing']),
  dominance: z.enum(['dominant', 'neutral', 'inferior']),
  confidence: z.number().min(0).max(1),
})

export const MatchEventSchema = z.object({
  timestamp_seconds: z.number().min(0),
  event_type_id: z.enum(EVENT_TYPE_IDS),
  actor: z.enum(['user', 'opponent']),
  outcome: z.enum(['successful', 'failed', 'reversed', 'ongoing']),
  technique_label: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

export const MatchExtractionOutputSchema = z.object({
  positions: z.array(PositionSegmentSchema).min(1),
  events: z.array(MatchEventSchema),
  overall_confidence: z.number().min(0).max(1),
  competitor_identifier: z.string().describe('How the competitor was identified (e.g. "blue gi, left side of screen at start")'),
  notes: z.string(),
})

export type MatchExtractionOutput = z.infer<typeof MatchExtractionOutputSchema>
export type PositionSegmentInput = z.infer<typeof PositionSegmentSchema>
export type MatchEventInput = z.infer<typeof MatchEventSchema>
