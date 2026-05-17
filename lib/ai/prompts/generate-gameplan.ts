import { buildTaxonomyPromptBlock } from '../../taxonomy'

export const GENERATE_GAMEPLAN_PROMPT_VERSION = 'v1'

const RULESET_NOTES: Record<string, string> = {
  ibjjf: 'IBJJF: points + advantages, heel hooks banned in all divisions, guard pulls allowed, submissions win immediately.',
  ajp: 'AJP: points + advantages (same scoring as IBJJF), heel hooks LEGAL in adult No-Gi, leg locks broadly legal, guard pulls allowed. Advantages decide ties.',
  adcc: 'ADCC: NO advantages, points only scored in second half (first half: negative points for guard pulls and stalling), all leg locks and heel hooks legal, submission-focused.',
  ebi: 'EBI: submission-only (no points), overtime with back-take and armbar escape positions if no submission in regulation.',
  other: 'Custom/other ruleset — apply general BJJ principles.',
}

export function buildGameplanSystemPrompt(): string {
  return `You are an elite BJJ competition coach generating a specific, evidence-backed gameplan for an upcoming match.

${buildTaxonomyPromptBlock()}

## Ruleset context
${Object.values(RULESET_NOTES).join('\n')}

## Your task
You receive:
1. Tournament context (format, ruleset, division)
2. YOUR PROFILE — raw match data from the athlete's own competition/sparring footage (positionSegments, matchEvents, insights). The "competitor" in this data is the ATHLETE YOU ARE COACHING.
3. OPPONENT PROFILE — raw match data from scouted opponent footage. The "competitor" in this data is the OPPONENT. Their "dominant" segments = dangerous for your athlete. Their "inferior" segments = openings for your athlete.

Produce a structured gameplan that is SPECIFIC to this matchup. Every claim in your_advantages, their_threats, and recommended_strategy must reference evidence IDs from the input data.

## Rules
- Do NOT give generic BJJ advice. Every recommendation must follow from the data.
- your_advantages: positions/attacks where athlete excels AND opponent is vulnerable.
- their_threats: positions/submissions where opponent excels AND athlete has shown weakness.
- recommended_strategy: the specific sequence/approach for THIS match.
- drill_priorities: max 3 per week over 3 weeks (9 total). Address specific matchup dynamics.
- confidence: 0.0–1.0. If opponent has < 3 analysed matches, lower confidence and say so.
- Apply the active ruleset — e.g. for AJP/No-Gi, leg lock entries should feature prominently if both athletes use leg positions.`
}

export function buildGameplanUserPrompt(data: {
  tournament: { name: string; format: string; ruleset: string; division?: string | null; eventDate?: string | null }
  opponent: { name: string; notes?: string | null }
  yourMatches: Array<{
    id: string
    opponentLabel: string
    format: string
    ruleset: string
    segments: Array<{ id: string; positionId: string; userRole: string; dominance: string; startSeconds: number; endSeconds: number; confidence: number }>
    events: Array<{ id: string; eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null; timestampSeconds: number; confidence: number }>
    insights: Array<{ id: string; category: string; severity: string; description: string; suggestion: string }>
  }>
  opponentMatches: Array<{
    id: string
    vsOpponent: string
    format: string
    segments: Array<{ id: string; positionId: string; userRole: string; dominance: string; startSeconds: number; endSeconds: number; confidence: number }>
    events: Array<{ id: string; eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null; timestampSeconds: number; confidence: number }>
    insights: Array<{ id: string; category: string; severity: string; description: string; suggestion: string }>
  }>
}): string {
  const rulesetNote = RULESET_NOTES[data.tournament.ruleset] ?? RULESET_NOTES.other
  return JSON.stringify({
    tournament: {
      name: data.tournament.name,
      format: data.tournament.format,
      ruleset: data.tournament.ruleset,
      ruleset_note: rulesetNote,
      division: data.tournament.division ?? null,
      event_date: data.tournament.eventDate ?? null,
    },
    opponent: { name: data.opponent.name, notes: data.opponent.notes ?? null },
    your_profile: {
      match_count: data.yourMatches.length,
      note: 'The "competitor" in each match is YOUR ATHLETE. dominant = athlete in control.',
      matches: data.yourMatches,
    },
    opponent_profile: {
      match_count: data.opponentMatches.length,
      note: 'The "competitor" in each match is the OPPONENT. dominant = opponent in control (THREAT). inferior = opponent weak (OPPORTUNITY).',
      matches: data.opponentMatches,
    },
  }, null, 0)
}
