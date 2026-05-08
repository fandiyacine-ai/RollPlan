export interface TaxonomyItem {
  id: string
  name: string
  aliases?: string[]
  parent?: string
}

export const POSITIONS: TaxonomyItem[] = [
  { id: 'standing', name: 'Standing' },
  { id: 'takedown_scramble', name: 'Takedown Scramble' },
  { id: 'closed_guard', name: 'Closed Guard', aliases: ['CG', 'full guard'] },
  { id: 'open_guard', name: 'Open Guard' },
  { id: 'half_guard', name: 'Half Guard', aliases: ['HG'] },
  { id: 'deep_half', name: 'Deep Half Guard', parent: 'half_guard' },
  { id: 'butterfly_guard', name: 'Butterfly Guard', aliases: ['BFG'] },
  { id: 'x_guard', name: 'X Guard', aliases: ['XG'] },
  { id: 'single_leg_x', name: 'Single Leg X', aliases: ['SLX', 'Ashi Garami'] },
  { id: 'de_la_riva', name: 'De La Riva', aliases: ['DLR'] },
  { id: 'reverse_de_la_riva', name: 'Reverse De La Riva', aliases: ['RDLR'] },
  { id: 'spider_guard', name: 'Spider Guard' },
  { id: 'lasso_guard', name: 'Lasso Guard' },
  { id: 'mount', name: 'Mount' },
  { id: 'side_control', name: 'Side Control', aliases: ['side mount'] },
  { id: 'knee_on_belly', name: 'Knee on Belly', aliases: ['KOB', 'knee on stomach'] },
  { id: 'back_control', name: 'Back Control', aliases: ['back mount', 'rear mount'] },
  { id: 'north_south', name: 'North South' },
  { id: 'turtle', name: 'Turtle' },
  { id: 'fifty_fifty', name: 'Fifty Fifty', aliases: ['50/50'] },
  { id: 'ashi_garami', name: 'Ashi Garami', aliases: ['inside sankaku'] },
  { id: 'leg_entanglement_other', name: 'Leg Entanglement (Other)' },
  { id: 'scrambling', name: 'Scrambling' },
  { id: 'on_top_attempting_pass', name: 'On Top Attempting Pass' },
  { id: 'transition', name: 'Transition' },
]

export const POSITION_IDS = POSITIONS.map(p => p.id) as [string, ...string[]]
