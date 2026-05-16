import { z } from 'zod'
import { POSITION_IDS } from '../../taxonomy/positions'

export const PositionVerificationSchema = z.object({
  reviews: z.array(z.object({
    segment_index: z.number().int().describe('Index into the submitted segment list'),
    confirmed: z.boolean().describe('True if the original label is correct'),
    corrected_position_id: z.enum(POSITION_IDS).optional().describe('New position if confirmed is false'),
    corrected_dominance: z.enum(['dominant', 'neutral', 'inferior']).optional(),
    confidence: z.number().min(0).max(1).describe('Your confidence in this review (not the original)'),
    reasoning: z.string().max(300),
  })),
})

export type PositionVerificationOutput = z.infer<typeof PositionVerificationSchema>
