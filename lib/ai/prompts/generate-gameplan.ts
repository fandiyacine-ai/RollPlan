import { buildTaxonomyPromptBlock } from '../../taxonomy'

export const GENERATE_GAMEPLAN_PROMPT_VERSION = 'v2'

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

Produce a structured gameplan that is SPECIFIC to this matchup. Base every claim on the patterns you observe in the data.

## Output rules

### match_card — produce this FIRST, before the full plan
The athlete will read this on their phone in a sports hall, adrenaline running, 5 minutes before the match. Every field must be a glanceable cue — NOT a sentence. Think like you're writing Post-it notes for a fighter. Rules:
- No full sentences. Fragments only.
- No explanations or "because". Just the action.
- If any field exceeds its word limit, cut ruthlessly.
- This card must stand alone — athlete should not need to read the full plan to act on it.

### Full gameplan
- Do NOT give generic BJJ advice. Every recommendation must follow from the data.
- Do NOT include raw IDs (UUIDs, hex strings, database references) anywhere in your output — write natural language only.
- opening: what to do in the first 30 seconds based on how the opponent typically starts.
- primary_chain: the most evidence-backed attack sequence for this matchup.
- secondary_options: fallback attacks when the primary chain is stuffed.
- defensive_priorities: the opponent's most dangerous weapons and how to neutralise them.
- opponent_intel: concrete threat, weakness, and 2–4 observed patterns.
- mental_cues: 2–5 short mat-side reminders (≤ 6 words each).
- If opponent has < 3 analysed matches, lower confidence and note it in the summary.
- Apply the active ruleset — e.g. for AJP/No-Gi, leg lock entries should feature prominently if both athletes use leg positions.`
}

type MatchForPrompt = {
  id: string
  format: string
  segments: Array<{ positionId: string; userRole: string; dominance: string; startSeconds: number; endSeconds: number }>
  events: Array<{ eventTypeId: string; actor: string; outcome: string; techniqueLabel: string | null }>
  insights: Array<{ category: string; severity: string; description: string; suggestion: string }>
}

// Reduce raw segment/event arrays to compact summaries before sending to the LLM.
// Raw timestamps add noise with no useful signal for planning; position-time % and
// event frequency give Claude everything it needs while cutting ~80% of token usage.
function aggregateMatchData(matches: MatchForPrompt[], perspective: 'your' | 'opponent') {
  const positionTime: Record<string, number> = {}
  let dominantSec = 0, inferiorSec = 0, totalSec = 0, topSec = 0, bottomSec = 0

  const finishCounts: Record<string, number> = {}
  const submissionAttempts: Record<string, number> = {}
  const attackActor = perspective === 'your' ? 'user' : 'opponent'

  for (const m of matches) {
    for (const s of m.segments) {
      const dur = Math.max(0, s.endSeconds - s.startSeconds)
      totalSec += dur
      positionTime[s.positionId] = (positionTime[s.positionId] ?? 0) + dur
      if (s.dominance === 'dominant') dominantSec += dur
      if (s.dominance === 'inferior') inferiorSec += dur
      if (s.userRole === 'top') topSec += dur
      if (s.userRole === 'bottom') bottomSec += dur
    }
    for (const e of m.events) {
      if (e.actor === attackActor && e.eventTypeId.includes('submission')) {
        const label = e.techniqueLabel ?? e.eventTypeId
        submissionAttempts[label] = (submissionAttempts[label] ?? 0) + 1
        if (e.outcome === 'success') finishCounts[label] = (finishCounts[label] ?? 0) + 1
      }
    }
  }

  const pct = (n: number) => totalSec > 0 ? Math.round((n / totalSec) * 100) : 0

  const topPositions = Object.entries(positionTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pos, secs]) => ({ position: pos, pct: pct(secs) }))

  const topFinishes = Object.entries(finishCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tech, count]) => ({ technique: tech, finishes: count, attempts: submissionAttempts[tech] ?? count }))

  const allInsights = matches.flatMap(m => m.insights)

  return {
    match_count: matches.length,
    dominance_pct: { dominant: pct(dominantSec), inferior: pct(inferiorSec), neutral: pct(totalSec - dominantSec - inferiorSec) },
    top_vs_bottom_pct: { top: pct(topSec), bottom: pct(bottomSec) },
    time_by_position: topPositions,
    submission_finishes: topFinishes,
    insights: allInsights,
  }
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

  const yourAgg = aggregateMatchData(data.yourMatches, 'your')
  const opponentAgg = aggregateMatchData(data.opponentMatches, 'opponent')

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
      note: 'YOUR ATHLETE. dominant = athlete in control. time_by_position shows where they spend time.',
      ...yourAgg,
    },
    opponent_profile: {
      note: 'OPPONENT. dominant = opponent in control (THREAT to your athlete). inferior = opponent vulnerable (OPPORTUNITY for your athlete).',
      ...opponentAgg,
    },
  }, null, 0)
}
