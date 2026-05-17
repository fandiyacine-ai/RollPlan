import { z } from 'zod'

export const GameplanOutputSchema = z.object({
  summary: z.string().describe('2–3 sentence tactical overview of this specific matchup'),
  format_notes: z.string().describe('Ruleset/format-specific considerations, e.g. heel hooks legal, advantages count'),

  opening: z.object({
    recommendation: z.string().describe('What to do in the first 30 seconds, e.g. "Pull to butterfly guard"'),
    rationale: z.string(),
    if_scrambled: z.string().describe('Fallback if the opening does not go to plan'),
  }),

  primary_chain: z.object({
    label: z.string().describe('Short name, e.g. "Butterfly sweep → back take → RNC"'),
    steps: z.array(z.string()).min(2).max(6),
    rationale: z.string().describe('Why this chain suits this specific matchup'),
  }),

  secondary_options: z.array(z.object({
    label: z.string(),
    rationale: z.string(),
  })).min(1).max(3),

  defensive_priorities: z.array(z.object({
    threat: z.string().describe("Opponent's specific threat — position or submission"),
    counter: z.string().describe('How to prevent or escape it'),
  })).min(1).max(4),

  opponent_intel: z.object({
    biggest_threat: z.string(),
    biggest_weakness: z.string(),
    patterns: z.array(z.string()).min(1).max(4),
  }),

  mental_cues: z.array(z.string()).min(2).max(5).describe('Short mat-side reminders'),
})

export type GameplanOutput = z.infer<typeof GameplanOutputSchema>
