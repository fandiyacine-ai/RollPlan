import { buildTaxonomyPromptBlock } from '../../taxonomy'
import { BJJ_POSITION_VISUAL_GUIDE } from './extract-match'

export const VERIFY_POSITIONS_PROMPT_VERSION = 'v1'

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function buildVerifyPositionsSystemPrompt(): string {
  return `You are a BJJ position verification expert. You will be shown a match video and a list of automatically-generated position labels at specific timestamps. Your sole job is to confirm or correct each label.

${buildTaxonomyPromptBlock()}

${BJJ_POSITION_VISUAL_GUIDE}

## Instructions
- For each segment, watch the video at the specified timestamp window.
- If the label is correct: set confirmed: true, set confidence to your certainty.
- If the label is wrong: set confirmed: false, provide corrected_position_id, corrected_dominance, and explain in reasoning.
- Only correct when you are at least 80% confident the label is wrong. If unsure, confirm the original.
- NEVER invent position IDs outside the taxonomy.`
}

export function buildVerifyPositionsUserPrompt(segments: Array<{
  index: number
  positionId: string
  userRole: string
  dominance: string
  startSeconds: number
  endSeconds: number
  confidence: number
}>): string {
  const list = segments
    .map(s =>
      `[${s.index}] ${fmt(s.startSeconds)}–${fmt(s.endSeconds)}: ${s.positionId} | ${s.userRole} | ${s.dominance} (original confidence: ${Math.round(s.confidence * 100)}%)`
    )
    .join('\n')

  return `Please verify these ${segments.length} position label(s) by watching the video at each timestamp:

${list}

Return a review for every segment in the list. Only correct if you are ≥80% confident the label is wrong.`
}
