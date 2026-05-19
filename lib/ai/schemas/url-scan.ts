import { z } from 'zod'

export const MatchResultSchema = z.object({
  winner_is_tracked_athlete: z.boolean().describe('true if the tracked athlete won this match'),
  method: z.enum(['submission', 'points', 'dq', 'unknown']),
  technique: z.string().optional().describe('e.g. "rear naked choke", "armbar", "advantage"'),
})

export const FoundMatchSchema = z.object({
  start_seconds: z.number().min(0).describe('Moment athletes begin grappling — NOT the name overlay, NOT the winner screen'),
  end_seconds: z.number().min(0).describe('Moment referee signals end — before any winner announcement graphic'),
  opponent_name: z.string(),
  round_or_bracket: z.string().optional().describe('e.g. "Semi-final", "Gold medal match"'),
  match_result: MatchResultSchema.optional().describe('Result extracted from the winner/outcome screen shown after the match'),
})

export const UrlScanOutputSchema = z.object({
  matches: z.array(FoundMatchSchema),
  athlete_found: z.boolean(),
  scan_notes: z.string(),
})

export type UrlScanOutput = z.infer<typeof UrlScanOutputSchema>
export type FoundMatch = z.infer<typeof FoundMatchSchema>
