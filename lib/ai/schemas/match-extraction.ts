import { z } from 'zod'
import { POSITION_IDS } from '../../taxonomy/positions'
import { EVENT_TYPE_IDS } from '../../taxonomy/events'

const BboxSchema = z.object({
  x1: z.number().min(0).max(1),
  y1: z.number().min(0).max(1),
  x2: z.number().min(0).max(1),
  y2: z.number().min(0).max(1),
})

export const PositionSegmentSchema = z.object({
  start_seconds: z.number().min(0),
  end_seconds: z.number().min(0),
  position_id: z.enum(POSITION_IDS),
  user_role: z.enum(['top', 'bottom', 'neutral', 'standing']),
  dominance: z.enum(['dominant', 'neutral', 'inferior']),
  confidence: z.number().min(0).max(1),
  user_bbox: BboxSchema.optional(),
  opponent_bbox: BboxSchema.optional(),
})

export const MatchEventSchema = z.object({
  timestamp_seconds: z.number().min(0),
  event_type_id: z.enum(EVENT_TYPE_IDS),
  actor: z.enum(['user', 'opponent']),
  outcome: z.enum(['successful', 'failed', 'reversed', 'ongoing']),
  technique_label: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

export const MatchResultSchema = z.object({
  winner: z.enum(['user', 'opponent']).describe('Who won the match'),
  method: z.enum(['submission', 'points', 'dq', 'walkover', 'unknown']),
  technique: z.string().optional().describe('Finishing technique if submission, e.g. "rear naked choke"'),
}).optional().describe('Result from the outcome screen at the end of the match. Omit if no result screen is visible.')

export const MatchExtractionOutputSchema = z.object({
  positions: z.array(PositionSegmentSchema),
  events: z.array(MatchEventSchema),
  overall_confidence: z.number().min(0).max(1),
  competitor_identifier: z.string().describe('How the competitor was identified (e.g. "blue gi, left side of screen at start")'),
  match_result: MatchResultSchema,
  notes: z.string(),
})

export type MatchResult = z.infer<typeof MatchResultSchema>

export type MatchExtractionOutput = z.infer<typeof MatchExtractionOutputSchema>
export type PositionSegmentInput = z.infer<typeof PositionSegmentSchema>
export type MatchEventInput = z.infer<typeof MatchEventSchema>
