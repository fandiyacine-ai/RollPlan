export const SCAN_SUBMISSIONS_PROMPT_VERSION = 'v2'

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function buildScanSubmissionsSystemPrompt(techniqueContext?: string): string {
  const techniqueSection = techniqueContext
    ? `\n\n${techniqueContext}\n\nUse the technique library above as additional visual reference when identifying submissions in the flagged windows.`
    : ''

  return `You are an expert BJJ video analyst performing a targeted re-scan for missed submission attempts.${techniqueSection}

You will be given specific time windows to examine. For each window, focus ONLY on that time range and look for submission setups — grips, isolations, and positional threats that put a joint or airway at risk.

## Visual signals for each submission type

**armbar** — Top or bottom athlete isolates ONE opponent arm, pulls it across their body so the elbow is aligned with their hips or centerline. They may begin extending the arm or leaning back. The key signal is the ARM ISOLATION GRIP — one hand on the wrist, the other controlling above or below the elbow. Even if the opponent bridges and escapes in 1–2 seconds, this is an armbar event.

**triangle** — Athlete closes legs in a figure-four (one leg behind the knee, one leg behind the neck/shoulder) around the opponent's head and one arm. Key signal: leg crossing behind the head/neck. Even if the opponent stacks and postures out.

**kimura** — Athlete grips the opponent's wrist with both hands in a figure-four (same-side hand grips their own wrist behind the opponent's wrist). Key signal: the double-wrist grip with elbow bent. Even if the opponent rolls through or pulls the arm free.

**omoplata** — Athlete wraps one leg over the opponent's shoulder/arm from guard. Key signal: the leg hooking over the shoulder from below.

**rear_naked_choke** — From back_control, athlete slides their forearm under the opponent's chin toward the opposite shoulder, other hand gripping. Key signal: forearm crossing the throat.

**guillotine** — Athlete wraps their arm under the opponent's chin (usually from front headlock). Key signal: arm around the neck from the front.

**heel_hook / kneebar / leg_lock_other** — Any leg entanglement where the joint (knee, heel, ankle) is being leveraged.

## Rules
- Scan the FULL duration of each window from start to end. Do NOT stop after finding the first event — there may be multiple submission attempts in the same window. Report EVERY distinct event you observe.
- Only report events you can CLEARLY see. Do not fabricate.
- A failed attempt (escaped in 1–2 seconds) is still a real event — use outcome="escaped".
- If you see nothing in the window, return an empty events array.
- Confidence below 0.65 means you are not sure enough — omit those.
- "user" = the main tracked competitor (same labelling as the rest of the match).`
}

export function buildScanSubmissionsUserPrompt(
  windows: Array<{
    start_seconds: number
    end_seconds: number
    reason: string
    likely_event_types: string[]
  }>
): string {
  const windowText = windows.map((w, i) => {
    return `Window ${i + 1}: ${fmt(w.start_seconds)} → ${fmt(w.end_seconds)}
  Why flagged: ${w.reason}
  Look especially for: ${w.likely_event_types.join(', ')}`
  }).join('\n\n')

  return `Scan the following time windows for missed submission attempts or significant events.

${windowText}

For each event found: record the exact timestamp (in seconds from the start of the video), the event type, who did it (user or opponent), and the outcome (escaped / successful / ongoing). Only report what you can clearly observe.`
}
