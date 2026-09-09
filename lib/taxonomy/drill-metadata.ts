// Lightweight, keyword-based classification for the drill library.
// The technique knowledge base has 100+ ad-hoc eventId/positionId values
// (e.g. "marceloplata", "backside_50_50_escape", "rdlr_hook_release") that
// don't map 1:1 onto the canonical taxonomy in lib/taxonomy. Rather than
// maintain an exhaustive per-id lookup table, we classify by keyword match
// against the combined eventId + positionId string. Unmatched entries fall
// back to sensible defaults ('fundamentals' / 'intermediate').

export type DrillCategory =
  | 'leg_locks'
  | 'chokes'
  | 'arm_locks'
  | 'sweeps'
  | 'passes'
  | 'takedowns'
  | 'back_control'
  | 'escapes'
  | 'fundamentals'

export type Difficulty = 'fundamental' | 'intermediate' | 'advanced'

export const DRILL_CATEGORIES: { id: DrillCategory; label: string }[] = [
  { id: 'fundamentals', label: 'Guard & Positional' },
  { id: 'arm_locks', label: 'Arm Locks' },
  { id: 'chokes', label: 'Chokes' },
  { id: 'leg_locks', label: 'Leg Locks' },
  { id: 'sweeps', label: 'Sweeps' },
  { id: 'passes', label: 'Guard Passes' },
  { id: 'takedowns', label: 'Takedowns & Scrambles' },
  { id: 'back_control', label: 'Back Attacks & Control' },
  { id: 'escapes', label: 'Escapes & Defense' },
]

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  fundamental: 'Fundamental',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export const DIFFICULTY_BELT_RANGE: Record<Difficulty, string> = {
  fundamental: 'White – Blue',
  intermediate: 'Blue – Purple',
  advanced: 'Purple+',
}

// Order matters: more specific / dangerous categories are checked first so
// e.g. "kimura_to_heel_hook" lands in leg_locks, not arm_locks.
const CATEGORY_KEYWORDS: [DrillCategory, string[]][] = [
  ['leg_locks', [
    'heel_hook', 'kneebar', 'toe_hold', 'calf_slicer', 'calf_crank', 'ankle_lock',
    'foot_lock', 'leg_lock', 'aoki_lock', 'banana_split', 'leg_entanglement',
    'straight_foot', 'ashi',
  ]],
  ['chokes', [
    'choke', 'triangle', 'darce', 'anaconda', 'guillotine', 'gogoplata', 'gogo_plata', 'rear_naked',
  ]],
  ['arm_locks', [
    'armbar', 'kimura', 'omoplata', 'wrist', 'americana', 'bicep', 'arm_trap',
    'arm_isolation', 'arm_lock', 'elbow', 'baratoplata', 'marceloplata', 'choi_bar',
  ]],
  ['sweeps', ['sweep']],
  ['passes', ['pass', 'knee_slice', 'over_under']],
  ['takedowns', ['takedown', 'scramble', 'ninja_roll', 'sumi_gaeshi']],
  ['back_control', ['back_take', 'back_control', 'crucifix', 'truck', 'mount_taken', 'control', 'back']],
  ['escapes', ['escape', 'defense', 'defence', 'counter']],
]

// Keywords pushing a drill to 'advanced' (riskier submissions, leg
// entanglements, modern guard systems usually taught past blue belt).
const ADVANCED_KEYWORDS = [
  'heel_hook', 'calf_slicer', 'calf_crank', 'kneebar', 'toe_hold', 'twister',
  'von_flue', 'baseball_bat', 'baseball_choke', 'clock_choke', 'paper_cutter',
  'bicep_slicer', 'banana_split', 'crucifix', 'truck', 'worm_guard', 'lasso_guard',
  'k_guard', 'single_leg_x', 'reverse_de_la_riva', 'rdlr', 'ashi', 'sankaku', 'saddle', 'gogoplata',
  'gogo_plata', 'aoki_lock', 'straight_foot', 'straight_ankle', 'marceloplata',
  'baratoplata', 'choi_bar', 'inverted', 'fifty_fifty', '50_50', 'leg_entanglement',
  'spread_chicken', 'sumi_gaeshi', 'ninja_roll', 'rubber_guard',
]

// Keywords typical of white-to-blue belt curriculum.
const FUNDAMENTAL_KEYWORDS = [
  'armbar', 'kimura', 'triangle', 'rear_naked', 'guillotine', 'ezekiel',
  'americana', 'sweep', 'pass', 'takedown', 'escape', 'mount', 'side_control',
  'closed_guard', 'back_control', 'back_take', 'knee_on_belly', 'guard_pass',
  'standing', 'turtle', 'north_south',
]

export function classifyDrillCategory(eventId: string, positionId: string | null): DrillCategory {
  const combined = `${eventId} ${positionId ?? ''}`.toLowerCase()
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(k => combined.includes(k))) return category
  }
  return 'fundamentals'
}

export function classifyDifficulty(eventId: string, positionId: string | null): Difficulty {
  const combined = `${eventId} ${positionId ?? ''}`.toLowerCase()
  if (ADVANCED_KEYWORDS.some(k => combined.includes(k))) return 'advanced'
  if (FUNDAMENTAL_KEYWORDS.some(k => combined.includes(k))) return 'fundamental'
  return 'intermediate'
}

// ─── Belt → recommended difficulty ───────────────────────────────────────────

const BELT_RANK: Record<string, number> = {
  white: 0, grey: 0, yellow: 0, orange: 0, green: 0,
  blue: 1,
  purple: 2,
  brown: 2,
  black: 2,
}

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  fundamental: 0,
  intermediate: 1,
  advanced: 2,
}

// True if a drill of this difficulty is part of the "core" curriculum for
// someone at this belt (used to surface a "Recommended for your belt" filter).
export function isRecommendedForBelt(difficulty: Difficulty, belt: string | null): boolean {
  const beltRank = belt ? (BELT_RANK[belt] ?? 0) : 0
  return DIFFICULTY_RANK[difficulty] <= beltRank
}
