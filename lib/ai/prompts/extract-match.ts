import { buildTaxonomyPromptBlock } from '../../taxonomy'

export const EXTRACT_MATCH_PROMPT_VERSION = 'v1'

export function buildExtractMatchSystemPrompt(): string {
  return `You are an expert BJJ (Brazilian Jiu-Jitsu) match analyst. Your task is to watch a competition or sparring match video and extract structured timeline data.

${buildTaxonomyPromptBlock()}

## Your task

1. First, identify the competitor of interest using the provided description (gi colour, side of screen, etc.). State how you identified them in competitor_identifier.
2. Segment the entire match timeline into position_segments — every second of the match must be covered.
3. Identify discrete events (submission attempts, sweeps, passes, takedowns, escapes, etc.).
4. Output ONLY valid JSON matching the required schema. No prose outside the JSON.

## Rules
- NEVER use position or event type IDs not in the taxonomy above.
- Segments must not overlap and must cover the full match duration.
- user_role refers to the competitor of interest's role (top/bottom/neutral/standing).
- dominance: dominant = competitor has clear control; inferior = opponent has clear control; neutral = neither.
- confidence reflects your certainty about the classification, not about whether the action happened.
- Express uncertainty via confidence (0.0–1.0), NEVER by hedging in the description field.
- If you cannot confidently classify a position, use transition.`
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function buildExtractMatchUserPrompt(params: {
  competitorDescription: string
  format: 'gi' | 'no_gi'
  ruleset: string
  durationSeconds?: number
  timestampRange?: { startSeconds: number; endSeconds: number }
}): string {
  return `Analyse this BJJ match video.

${params.timestampRange
    ? `Focus only on the match segment from ${formatTimestamp(params.timestampRange.startSeconds)} to ${formatTimestamp(params.timestampRange.endSeconds)}. Ignore all footage outside this range.`
    : ''}
Competitor to track: ${params.competitorDescription}
Format: ${params.format === 'gi' ? 'Gi' : 'No-Gi'}
Ruleset: ${params.ruleset.toUpperCase()}
${params.durationSeconds ? `Duration: approximately ${Math.round(params.durationSeconds / 60)} minutes` : ''}

Output the full structured JSON with positions and events.`
}
