export const REVIEW_EVENTS_PROMPT_VERSION = 'v1'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function buildReviewEventsSystemPrompt(): string {
  return `You are a BJJ data quality auditor. A video analysis model has extracted position segments and events from a match. Your job is to find statistical anomalies that indicate the model missed events — especially submission attempts that were attempted but not finished.

## Patterns that strongly indicate missed events

### Missed submission attempts (most common gap)

**Rapid mount cycling** — 3 or more consecutive mount_taken events within a 2-minute window with ZERO submission events (armbar, triangle, kimura, choke) in that window.
Why this matters: when a top player loses mount 3+ times in rapid succession, they are almost always ATTEMPTING something (typically an armbar from mount) and getting bucked/bridged off each time. The attempt is real even if the mount is lost in 2-3 seconds.

**Extended back_control with no choke event** — back_control held for 15+ cumulative seconds with no rear_naked_choke, triangle, or choke_other event.
Why: athletes in back control almost always attempt a choke. If none is recorded, the model likely missed the arm sliding under the chin.

**Long guard with no attacks** — closed_guard or butterfly_guard held for 30+ cumulative seconds with no sweep, triangle, omoplata, or armbar event.
Why: active guard players consistently attack. Zero events over 30s of guard is suspicious.

### Missed positional events

**Position jump without transition event** — if position changes from one dominant position to another in the same direction (e.g., side_control → mount) with no intermediate transition and no pass/sweep event recorded.

## Rules
- Only flag windows where evidence is clear — 3+ repeated failed mounts, 15s+ of back control, etc.
- Do NOT flag isolated 2-3 second mount windows or very short sequences.
- Do NOT flag if relevant events already exist within the window.
- Be conservative: a false positive (sending Gemini to re-scan when nothing is there) costs money. Only flag high-confidence gaps.
- Priority "high" = you are confident a real event was missed. Priority "medium" = worth checking but uncertain.`
}

export function buildReviewEventsUserPrompt(params: {
  segments: Array<{
    start_seconds: number
    end_seconds: number
    position_id: string
    user_role: string
    dominance: string
  }>
  events: Array<{
    timestamp_seconds: number
    event_type_id: string
    actor: string
    outcome: string | null
  }>
}): string {
  const segLines = params.segments
    .map(s => `${fmt(s.start_seconds)}-${fmt(s.end_seconds)} | ${s.position_id} | role=${s.user_role} | dom=${s.dominance}`)
    .join('\n')

  const eventLines = params.events.length === 0
    ? '(none recorded)'
    : params.events
        .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds)
        .map(e => `${fmt(e.timestamp_seconds)} | ${e.event_type_id} | actor=${e.actor} | outcome=${e.outcome}`)
        .join('\n')

  return `Review this match data for missing events.

## Position segments (${params.segments.length} segments)
${segLines}

## Events recorded (${params.events.length} events)
${eventLines}

Look especially for:
1. Rapid mount cycling (3+ consecutive mount_taken with no submission events)
2. Long back_control with no choke attempt
3. Long guard periods with no sweep or submission

Return only windows where you are confident events were missed.`
}
