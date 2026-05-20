import type { GameplanOutput } from '../schemas/gameplan'

export const GENERATE_EXECUTION_DEBRIEF_PROMPT_VERSION = 'v1'

export function buildDebriefSystemPrompt(): string {
  return `You are an elite BJJ coach conducting a post-match debrief.

You receive:
1. The GAMEPLAN written before the match — opening recommendation, primary attack chain, defensive priorities.
2. The ACTUAL MATCH DATA — position segments (what positions, who was on top, who dominated) and events (submissions, sweeps, takedowns) extracted from video analysis of the real match.

Your task: compare what was PLANNED against what ACTUALLY HAPPENED, and produce a structured learning report.

## Rules
- Be specific and honest. Reference actual positions and events from the data. Do not hallucinate.
- If match data is sparse (few segments / events), say so and use verdict 'insufficient_data'.
- verdict guidelines:
  * executed_well — athlete followed the opening and primary chain in spirit; match went largely as planned
  * partially_executed — some elements followed but key deviations occurred
  * not_executed — significant departure from the plan throughout
  * insufficient_data — too few data points to draw reliable conclusions
- opening.execution: was the planned opening strategy attempted?
- primary_chain.execution: were the planned attack sequences attempted?
- what_worked: things that actually happened and were positive (≤ 1–2 sentences each)
- what_to_improve: specific gaps where the plan was not executed (≤ 1–2 sentences each)
- key_learnings: forward-looking insights for the next match — not recaps, but lessons`
}

export function buildDebriefUserPrompt(data: {
  gameplan: GameplanOutput
  match: {
    result: { winner: string | null; method: string | null; technique: string | null }
    segments: Array<{ positionId: string; userRole: string; dominance: string; durationSeconds: number }>
    events: Array<{ eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null; timestampSeconds: number }>
  }
}): string {
  const { gameplan, match } = data

  const resultStr = match.result.winner
    ? `${match.result.winner === 'user' ? 'WIN' : 'LOSS'} by ${match.result.method ?? 'unknown'}${match.result.technique ? ` (${match.result.technique})` : ''}`
    : 'No result recorded'

  const topSegments = match.segments
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, 15)

  const segmentLines = topSegments.length > 0
    ? topSegments.map(s => `  ${s.positionId} | ${s.userRole} | ${s.dominance} | ${Math.round(s.durationSeconds)}s`).join('\n')
    : '  (no segments recorded)'

  const sortedEvents = match.events.sort((a, b) => a.timestampSeconds - b.timestampSeconds)
  const eventLines = sortedEvents.length > 0
    ? sortedEvents.map(e => `  ${Math.round(e.timestampSeconds)}s | ${e.eventTypeId} | actor:${e.actor} | ${e.outcome} | ${e.techniqueLabel ?? 'n/a'}`).join('\n')
    : '  (no events recorded)'

  return `## GAMEPLAN (pre-match)

Opening: ${gameplan.opening.recommendation}
Rationale: ${gameplan.opening.rationale}
If scrambled: ${gameplan.opening.if_scrambled}

Primary chain: ${gameplan.primary_chain.label}
Steps:
${gameplan.primary_chain.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

Secondary options:
${gameplan.secondary_options.map(o => `  - ${o.label}`).join('\n')}

Defensive priorities:
${gameplan.defensive_priorities.map(d => `  - Threat: ${d.threat} → Counter: ${d.counter}`).join('\n')}

---

## ACTUAL MATCH DATA

Result: ${resultStr}

Position segments (top 15 by duration — position | user role | dominance | seconds):
${segmentLines}

Events (chronological — time | type | actor | outcome | technique):
${eventLines}

---

Generate the execution debrief comparing the gameplan against what actually happened.`
}
