import type { TaxonomyItem } from './positions'

export const EVENT_TYPES: TaxonomyItem[] = [
  // Submission attempts
  { id: 'armbar', name: 'Armbar', parent: 'submission' },
  { id: 'triangle', name: 'Triangle Choke', parent: 'submission' },
  { id: 'kimura', name: 'Kimura', parent: 'submission' },
  { id: 'omoplata', name: 'Omoplata', parent: 'submission' },
  { id: 'rear_naked_choke', name: 'Rear Naked Choke', aliases: ['RNC'], parent: 'submission' },
  { id: 'guillotine', name: 'Guillotine', parent: 'submission' },
  { id: 'choke_other', name: 'Choke (Other)', parent: 'submission' },
  { id: 'kneebar', name: 'Kneebar', parent: 'submission' },
  { id: 'heel_hook', name: 'Heel Hook', aliases: ['inside heel hook', 'outside heel hook'], parent: 'submission' },
  { id: 'leg_lock_other', name: 'Leg Lock (Other)', parent: 'submission' },
  { id: 'joint_lock_other', name: 'Joint Lock (Other)', parent: 'submission' },
  // Positional events
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
