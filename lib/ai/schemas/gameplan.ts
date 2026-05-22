import { z } from 'zod'

export const GameplanOutputSchema = z.object({
  // ── Match-day card ───────────────────────────────────────────────────────────
  // Ultra-compact view. Every field must be readable in under 2 seconds — no sentences.
  match_card: z.object({
    headline: z.string().describe('One-sentence plan: the essential matchup story, e.g. "Drag to back, suffocate, RNC"'),
    open_with: z.string().describe('First action when the match starts — max 7 words, imperative, e.g. "Pull butterfly, control sleeve immediately"'),
    attack_chain: z.array(z.string()).min(2).max(4).describe('Primary sequence — each step max 5 words, e.g. ["Hip bump sweep", "Take the back", "RNC"]'),
    watch_out: z.string().describe('The single biggest threat from this opponent — max 8 words, e.g. "Guard pass to knee slice pressure"'),
    if_losing_points: z.string().describe('What to do if behind on points with < 2 min remaining — max 8 words'),
  }).describe('Compact match-day card — displayed above the full gameplan for quick reference on the mat'),

  // ── Full gameplan ────────────────────────────────────────────────────────────
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
