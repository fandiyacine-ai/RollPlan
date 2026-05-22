import { z } from 'zod'

export const MatchResultSchema = z.object({
  winner_is_tracked_athlete: z.boolean().describe('true if the tracked athlete won this match'),
  method: z.enum(['submission', 'points', 'dq', 'walkover', 'unknown']),
  technique: z.string().optional().describe('e.g. "rear naked choke", "armbar", "advantage"'),
})

export const FoundMatchSchema = z.object({
  start_seconds: z.number().min(0).describe('Moment athletes begin grappling — NOT the name overlay, NOT the winner screen'),
  end_seconds: z.number().min(0).describe('Moment referee signals end — before any winner announcement graphic'),
  outcome_screen_seconds: z.number().min(0).describe('Timestamp when the winner/result screen appears — the scoreboard highlight or winner announcement graphic shown AFTER the match ends. This is the most important timestamp — report it precisely.'),
  opponent_name: z.string(),
  round_or_bracket: z.string().optional().describe('e.g. "Semi-final", "Gold medal match"'),
  is_walkover: z.boolean().optional().describe('true if no match was actually fought — opponent did not show up, match awarded without grappling'),
  match_result: MatchResultSchema.optional().describe('Result extracted from the winner/outcome screen shown after the match'),
  user_side: z.enum(['left', 'right']).optional().describe('Which side of the scoreboard the tracked athlete appears on (left or right). In AJP/Smoothcomp scoreboards, the left-side name starts on the LEFT of the mat, and vice versa. Read this directly from the active scoreboard.'),
})

export const UrlScanOutputSchema = z.object({
  matches: z.array(FoundMatchSchema),
  athlete_found: z.boolean(),
  scan_notes: z.string(),
})

export type UrlScanOutput = z.infer<typeof UrlScanOutputSchema>
export type FoundMatch = z.infer<typeof FoundMatchSchema>
