import { z } from 'zod'

export const FoundMatchSchema = z.object({
  start_seconds: z.number().min(0),
  end_seconds: z.number().min(0),
  opponent_name: z.string(),
  round_or_bracket: z.string().optional().describe('e.g. "Semi-final", "Gold medal match"'),
})

export const UrlScanOutputSchema = z.object({
  matches: z.array(FoundMatchSchema),
  athlete_found: z.boolean(),
  scan_notes: z.string(),
})

export type UrlScanOutput = z.infer<typeof UrlScanOutputSchema>
export type FoundMatch = z.infer<typeof FoundMatchSchema>
