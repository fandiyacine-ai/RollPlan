import { buildTaxonomyPromptBlock } from '../../taxonomy'

export const BUILD_PLAYER_CARD_PROMPT_VERSION = 'v1'

export function buildPlayerCardSystemPrompt(): string {
  return `You are an expert BJJ analyst building a Player Card — a structured scouting profile — from multiple match analyses.

${buildTaxonomyPromptBlock()}

## Rules
- Percentages and counts must be computable from the input data. Do not invent numbers.
- Every claim in top_strengths, top_weaknesses, and x_factor must have evidence_segment_ids or evidence_event_ids.
- The narrative_summary must reflect only what is in the data. Sample size must be acknowledged.
- common_mistakes must come from recurring patterns, not one-off events.
- If fewer than 3 matches are provided, note the limited sample size prominently in narrative_summary.`
}
