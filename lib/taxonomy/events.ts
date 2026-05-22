import type { TaxonomyItem } from './positions'

export const EVENT_TYPES: TaxonomyItem[] = [
  // ── Arm attacks ───────────────────────────────────────────────────────────────
  { id: 'armbar', name: 'Armbar', parent: 'submission' },
  { id: 'kimura', name: 'Kimura', parent: 'submission' },
  { id: 'omoplata', name: 'Omoplata', parent: 'submission' },
  { id: 'wrist_lock', name: 'Wrist Lock', aliases: ['small joint manipulation'], parent: 'submission' },
  { id: 'bicep_slicer', name: 'Bicep Slicer', aliases: ['bicep crush', 'bicep crank'], parent: 'submission' },
  { id: 'joint_lock_other', name: 'Joint Lock (Other)', parent: 'submission' },

  // ── Chokes / strangles ────────────────────────────────────────────────────────
  { id: 'triangle', name: 'Triangle Choke', parent: 'submission' },
  { id: 'rear_naked_choke', name: 'Rear Naked Choke', aliases: ['RNC', 'mata leao'], parent: 'submission' },
  { id: 'guillotine', name: 'Guillotine', aliases: ['high elbow guillotine', 'arm-in guillotine', 'HEG'], parent: 'submission' },
  { id: 'darce', name: "D'arce Choke", aliases: ['brabo choke', 'no-gi arm triangle'], parent: 'submission' },
  { id: 'anaconda_choke', name: 'Anaconda Choke', aliases: ['arm triangle from front headlock'], parent: 'submission' },
  { id: 'north_south_choke', name: 'North-South Choke', aliases: ['NS choke'], parent: 'submission' },
  { id: 'ezekiel_choke', name: 'Ezekiel Choke', aliases: ['sleeve choke', 'sode guruma jime'], parent: 'submission' },
  { id: 'von_flue_choke', name: 'Von Flue Choke', aliases: ['guillotine counter choke'], parent: 'submission' },
  { id: 'twister', name: 'Twister', aliases: ['spine lock', 'truck submission'], parent: 'submission' },
  // Gi-specific chokes
  { id: 'baseball_bat_choke', name: 'Baseball Bat Choke', aliases: ['baseball choke'], parent: 'submission' },
  { id: 'clock_choke', name: 'Clock Choke', parent: 'submission' },
  { id: 'paper_cutter_choke', name: 'Paper Cutter Choke', aliases: ['senkaku', 'cross collar from side'], parent: 'submission' },
  { id: 'choke_other', name: 'Choke (Other)', parent: 'submission' },

  // ── Leg attacks ───────────────────────────────────────────────────────────────
  { id: 'heel_hook', name: 'Heel Hook', aliases: ['inside heel hook', 'outside heel hook', 'IHH', 'OHH'], parent: 'submission' },
  { id: 'kneebar', name: 'Kneebar', parent: 'submission' },
  { id: 'toe_hold', name: 'Toe Hold', aliases: ['toehold', 'foot lock variation'], parent: 'submission' },
  { id: 'calf_slicer', name: 'Calf Slicer', aliases: ['calf crush', 'calf crank'], parent: 'submission' },
  { id: 'leg_lock_other', name: 'Leg Lock (Other)', parent: 'submission' },

  // ── Positional events ─────────────────────────────────────────────────────────
  { id: 'sweep', name: 'Sweep', parent: 'positional' },
  { id: 'pass', name: 'Guard Pass', parent: 'positional' },
  { id: 'takedown', name: 'Takedown', parent: 'positional' },
  { id: 'guard_pull', name: 'Guard Pull', parent: 'positional' },
  { id: 'escape', name: 'Escape', parent: 'positional' },
  { id: 'back_take', name: 'Back Take', parent: 'positional' },
  { id: 'mount_taken', name: 'Mount Taken', parent: 'positional' },
  { id: 'scramble_won', name: 'Scramble Won', parent: 'positional' },
  { id: 'near_submission_escaped', name: 'Near Submission Escaped', parent: 'positional' },
  { id: 'tap', name: 'Tap (Submission)', parent: 'positional' },
]

export const EVENT_TYPE_IDS = EVENT_TYPES.map(e => e.id) as [string, ...string[]]
