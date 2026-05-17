import { buildTaxonomyPromptBlock } from '../../taxonomy'

export const EXTRACT_MATCH_PROMPT_VERSION = 'v2'

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

export function buildExtractMatchSystemPrompt(): string {
  return `You are an expert BJJ (Brazilian Jiu-Jitsu) match analyst. Your task is to watch a competition or sparring match video and extract structured timeline data.

${buildTaxonomyPromptBlock()}

${BJJ_POSITION_VISUAL_GUIDE}

## Your task

1. First, identify the competitor of interest using the provided description and any reference image. There are exactly TWO athletes — one is "user", the other is "opponent". State in competitor_identifier which visual features (gi colour, body position, side of frame) confirm which athlete is the user.
2. Segment the ENTIRE video from second 0 to the very last second — every second must fall into exactly one segment. No gaps. Pre-match standing/bowing = standing/neutral. Post-match celebration = standing/neutral. Do not stop early.
3. Identify discrete events (submission attempts, sweeps, passes, takedowns, escapes, etc.).
4. Apply the self-review checklist above before finalising your output.
5. Output ONLY valid JSON matching the required schema. No prose outside the JSON.

## Rules
- NEVER use position or event type IDs not in the taxonomy above.
- Segments must not overlap. They must start at 0 and collectively span the FULL video duration with no gaps. If the video duration is given, your last segment must end at that exact second.
- user_role refers to the competitor of interest's role (top/bottom/neutral/standing).
- dominance: dominant = competitor has clear control; inferior = opponent has clear control; neutral = neither.
- confidence reflects your certainty about the classification, not about whether the action happened.
- Express uncertainty via confidence (0.0–1.0), NEVER by hedging in the description field.
- If you cannot confidently classify a position, use transition.
- CRITICAL: Once you identify which athlete is the user, track THAT SAME PERSON consistently for the entire match. Do not swap who is "user" and who is "opponent" mid-match even during scrambles or position reversals. The identity of the two athletes does not change — only their positions do.

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
  appearanceHint?: string
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
${params.appearanceHint ? `CRITICAL — Visual identification (apply for the ENTIRE match):\n${params.appearanceHint}\nIf a reference photo was provided above, that photo shows the user — match their exact appearance. Use these constraints as the deciding factor whenever the two athletes look similar or swap positions. Do NOT swap who is "user" and who is "opponent" at any point.` : ''}
Format: ${params.format === 'gi' ? 'Gi' : 'No-Gi'}
Ruleset: ${params.ruleset.toUpperCase()}
${params.durationSeconds ? `IMPORTANT — Video duration: exactly ${params.durationSeconds} seconds (${formatTimestamp(params.durationSeconds)}). Your segments must start at 0 and the last segment must end at ${params.durationSeconds}. Do not stop short.` : ''}

Output the full structured JSON with positions and events.`
}
