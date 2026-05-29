import { buildTaxonomyPromptBlock } from '../../taxonomy'

export const EXTRACT_MATCH_PROMPT_VERSION = 'v9'

export const BJJ_POSITION_VISUAL_GUIDE = `## Visual Identification Guide — Commonly Confused Positions

**back_control** vs **closed_guard** (most common error)
- back_control: attacker is BEHIND the defender, both facing the same direction (chest-to-back). Attacker's legs hook inside the defender's hips from behind. Arms in seat-belt (one over shoulder, one under armpit) or both overhooks. The defender cannot see the attacker's face.
- closed_guard: guard player lies on their back and wraps BOTH legs around the opponent's waist from the FRONT. They face each other. Attacker's hips are between the guard player's thighs. The two athletes face each other.
→ If the competitor has their back to the mat and opponent is behind them: back_control. If they face each other: closed_guard.

**mount** vs **side_control**
- mount: attacker sits directly ON TOP of the defender, straddling the torso. Both knees are on the mat on either side of the defender's ribs. Attacker's crotch is over the defender's stomach or chest.
- side_control: attacker lies BESIDE the defender, perpendicular to them. Hips are on the mat next to the defender — NOT straddling.

**mount** vs **knee_on_belly**
- mount: both knees on the ground, fully straddling the torso.
- knee_on_belly: ONE knee presses into the stomach/ribs; the other foot is posted on the mat for balance. Attacker's hips are raised.

**turtle** vs **back_control**
- turtle: defender is on hands and knees or curled into a ball. Attacker is circling or draped over the back but does NOT yet have both hooks inside the hips.
- back_control: hooks (feet) are established inside the defender's hips. Attacker's full body is locked onto the defender's back.

**north_south** vs **side_control**
- north_south: attacker's head is near the defender's hips/thighs; they are INVERTED relative to each other (head-to-feet alignment).
- side_control: both athletes have the same head direction; attacker is beside the defender, not rotated.

**half_guard** vs **closed_guard**
- half_guard: guard player's legs trap ONE of the top player's legs between both of theirs.
- closed_guard: legs wrap around the opponent's full WAIST — both of the opponent's legs are outside.

**butterfly_guard** vs **half_guard**
- butterfly_guard: both feet hooked INSIDE the opponent's inner thighs (butterfly hooks); guard player usually sitting up.
- half_guard: guard player's legs clamp one of the opponent's legs; guard player typically on their side or back.

## Self-review checklist — verify BEFORE outputting

1. Any segment labeled **back_control**: can you clearly see the attacker physically BEHIND the defender, chest pressed against the defender's back? If they are facing each other, it is NOT back_control — reconsider closed_guard, turtle, or scrambling.
2. Any segment labeled **closed_guard**: can you see the guard player's legs wrapped around the opponent's waist with both athletes facing each other? If the attacker is behind the defender, it is NOT closed_guard.
3. Any segment labeled **mount**: is the attacker fully straddling the torso with both knees down? If off to the side, reconsider side_control. If one knee is raised, reconsider knee_on_belly.
4. Any segment labeled **side_control**: confirm the attacker is NOT straddling — hips should be beside, not over, the defender.
5. Any segment with confidence < 0.6: prefer transition, scrambling, or a broader parent category rather than guessing a specific position.`

export function buildExtractMatchSystemPrompt(techniqueContext?: string): string {
  return `You are an expert BJJ (Brazilian Jiu-Jitsu) match analyst. Your task is to watch a competition or sparring match video and extract structured timeline data.

${buildTaxonomyPromptBlock()}

${BJJ_POSITION_VISUAL_GUIDE}
${techniqueContext ? `\n${techniqueContext}\n` : ''}

## Your task — follow these steps in order

### Step 1 — Anchor identity from the outcome screen (do this FIRST)

Scan the clip and find the outcome screen for THIS match: the scoreboard highlight, winner announcement, or result graphic that shows which athlete won.

**CRITICAL — Multi-match streams**: Competition streams record back-to-back matches on the same mat. This clip may contain outcome screens for OTHER matches (adjacent matches on the same mat). You must use ONLY the outcome screen that belongs to the match you are analysing:
- The correct outcome screen will show the names of the TWO athletes in THIS match (the tracked competitor AND their opponent, if their name was provided).
- If you see an outcome screen with completely different athlete names, it belongs to another match — skip it.
- The correct outcome screen will appear immediately after the match action ends (referee separation or submission tap), NOT before the athletes step on the mat.

Once you find the correct outcome screen:
- Read the winner's name from that screen exactly as shown.
- Find which physical athlete on the mat corresponds to that name (they are being raised, celebrated, or highlighted).
- That physical athlete is **"user"** if their name matches the tracked competitor you were given. Otherwise they are **"opponent"**.
- Lock in which body/appearance corresponds to "user" and which to "opponent". You will not change this assignment for any reason.
- Record this in competitor_identifier: e.g. "User anchored from outcome screen — DARIO MIKEL highlighted as winner, wearing blue gi on left side at end."

If no outcome screen is visible for this match, fall back to the provided appearance description and any reference image to identify the user.

### Step 2 — Analyse positions and events

Using the identity anchor from Step 1, segment the ENTIRE video from second 0 to the very last second. Every second must fall into exactly one segment. No gaps. Pre-match standing/bowing = standing/neutral. Post-match celebration = standing/neutral. Do not stop early.

### Step 3 — Record the result

From the outcome screen found in Step 1, populate match_result: winner ("user" or "opponent"), method ("submission", "points", "dq", "walkover"), and technique if visible. Omit match_result if no outcome screen was visible.

### Step 4 — Identify events

Identify discrete events: submission attempts, sweeps, guard passes, takedowns, escapes, back takes, guard pulls, etc.

**Submission attempt detection — fire on the SETUP, not just the tap:**

Record a submission event as soon as you observe the isolating grip or positional threat — even if the opponent escapes within 1–2 seconds. A failed attempt is still a real event; use outcome="escaped".

Visual signals for each type:
- **armbar**: top or bottom athlete isolates ONE opponent arm across their centreline — one hand gripping the wrist, other arm or body controlling the elbow. They may lean back or extend. Key moment: the moment the arm is pulled away from the opponent's body and aligned with the attacker's hips. Record even if the opponent bridges out immediately.
  - **Armbar from closed guard (very common)**: the guard player (on their back) breaks one of the top athlete's arms across, pins the elbow with their chest/armpit, swings their hips out to the side, and throws a leg over the head to extend. Watch for: guard player pulling one arm across their centreline, hip escape to the side, leg swinging over. Record this even if the top player stacks and escapes immediately.
- **triangle**: athlete's legs close in a figure-four around the opponent's head and one arm — one leg crossing behind the neck, the other locking behind the first knee. Record when the leg crosses behind the head/neck.
- **kimura**: figure-four double grip on the opponent's wrist with the elbow bent — same-side hand grips attacker's own wrist behind the opponent's wrist. Record when the double grip is established.
- **omoplata**: athlete's leg wraps over the opponent's shoulder/tricep from guard, threatening the shoulder. Record when the leg locks across the shoulder.
- **rear_naked_choke**: from back_control, attacker slides forearm under the opponent's chin toward the opposite shoulder. Record when the forearm crosses the throat.
- **guillotine**: arm wraps under the opponent's chin from a front headlock. Record when the arm encircles the neck.
- **heel_hook / kneebar / leg_lock_other**: any leg entanglement with a joint at risk.

**Mount cycling — special rule:**
If you observe mount being taken and lost 3 or more times within a 2-minute window (rapid cycling), the top athlete is almost certainly making repeated submission attempts from mount (most commonly armbar). For each mount window in that sequence, look specifically at what the top athlete's hands are doing with the opponent's arm. If you can see any arm isolation — even briefly — record an armbar event with outcome="escaped".

### Step 5 — Self-review

Apply the self-review checklist above before finalising your output. Then apply these event-specific checks:

**Event self-review:**
1. If you recorded 3 or more mount_taken events: verify that at least one submission attempt event exists within that window. If the top athlete's hands moved toward the opponent's arm at any point, record the armbar attempt.
2. If the match ended by submission (method="submission"): confirm there is a corresponding successful submission event near the end of the match. If missing, add it.
3. If back_control was held for 15+ seconds total: confirm at least one choke attempt is recorded. If not, re-examine those back_control segments.
4. If closed_guard was held for 15+ seconds with the user on TOP (user_role=top): re-examine that window specifically for armbar and triangle attempts by the bottom athlete (opponent). Guard players routinely attack with armbars and triangles — check whether the opponent pulled any arm across their centreline or swung a leg over at any point.

Output ONLY valid JSON matching the required schema. No prose outside the JSON.

## Rules
- NEVER use position or event type IDs not in the taxonomy above.
- Segments must not overlap. They must start at 0 and collectively span the FULL video duration with no gaps. If the video duration is given, your last segment must end at that exact second.
- user_role refers to the competitor of interest's role (top/bottom/neutral/standing).
- dominance: dominant = competitor has clear control; inferior = opponent has clear control; neutral = neither.
- confidence reflects your certainty about the classification, not about whether the action happened.
- Express uncertainty via confidence (0.0–1.0), NEVER by hedging in the description field.
- If you cannot confidently classify a position, use transition.
- CRITICAL: Once you anchor which physical athlete is "user" in Step 1, track THAT SAME PERSON for the entire match. Never swap user/opponent mid-match even during scrambles.

## Bounding boxes

For each position_segment, estimate bounding boxes for the user and opponent as normalized coordinates (0.0–1.0) relative to the full frame:
- user_bbox: { x1, y1, x2, y2 } wrapping the user athlete’s full body at a representative frame near segment midpoint
- opponent_bbox: { x1, y1, x2, y2 } wrapping the opponent athlete’s full body
- (x1,y1) is the top-left corner, (x2,y2) is the bottom-right corner — x1<x2 and y1<y2 must hold
- Accuracy within ±0.08 is sufficient; prefer slightly wider boxes over clipping limbs
- Omit the field entirely if the athlete is fully off-screen, heavily occluded, or the segment is too brief (<2 s) to judge`
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
  opponentName?: string
  appearanceHint?: string
  format: 'gi' | 'no_gi'
  ruleset: string
  durationSeconds?: number
  outcomeScreenSeconds?: number
  userSide?: 'left' | 'right'
}): string {
  return `Analyse this BJJ match video.

${params.outcomeScreenSeconds !== undefined
    ? `OUTCOME SCREEN ANCHOR: The winner/result screen for the match between ${params.competitorDescription}${params.opponentName ? ` and ${params.opponentName}` : ''} appears at approximately ${formatTimestamp(params.outcomeScreenSeconds)} in this clip. This is your primary anchor — find it first, confirm it shows these athletes, then work BACKWARDS to find where their match started. Do NOT analyse any match that ends before this outcome screen.`
    : ''}
${params.userSide !== undefined
    ? `SPATIAL IDENTITY ANCHOR: The scan phase estimated that ${params.competitorDescription} appears on the ${params.userSide.toUpperCase()} side of the scoreboard — but an athlete's side can change between matches, so ALWAYS verify by reading the live scoreboard visible in THIS clip. Find the active scoreboard for this match, locate ${params.competitorDescription}'s name, and confirm which side (left or right) their name actually appears on. In AJP/Smoothcomp/IBJJF overlays, the athlete whose name is on the LEFT starts on the LEFT side of the mat at the opening handshake. Use the first few seconds of standing action to lock in which physical person is "${params.competitorDescription}" (user). Once locked, track that same person for the full match — do NOT swap roles mid-match. The scoreboard is the ground truth; the scan estimate is only a hint.`
    : ''}
Competitor to track: ${params.competitorDescription}
${params.opponentName
    ? `Opponent: ${params.opponentName}
The outcome screen for THIS match will show one of these two names as winner. If you see an outcome screen with completely different athlete names, it belongs to an adjacent match on the same mat — find the one that references ${params.competitorDescription} or ${params.opponentName}.`
    : ''}
${params.appearanceHint ? `CRITICAL — Visual identification (apply for the ENTIRE match):\n${params.appearanceHint}\nIf a reference photo was provided above, that photo shows the user — match their exact appearance. Use these constraints as the deciding factor whenever the two athletes look similar or swap positions. Do NOT swap who is "user" and who is "opponent" at any point.` : ''}
Format: ${params.format === 'gi' ? 'Gi' : 'No-Gi'}
Ruleset: ${params.ruleset.toUpperCase()}
${params.durationSeconds ? `IMPORTANT — Video duration: exactly ${params.durationSeconds} seconds (${formatTimestamp(params.durationSeconds)}). Your segments must start at 0 and the last segment must end at ${params.durationSeconds}. Do not stop short.` : ''}

Output the full structured JSON with positions and events.`
}
