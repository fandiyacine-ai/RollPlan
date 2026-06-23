/** Maps technique_variants.event_id → Roboflow bjj-submissions class name. */
export const ROBOFLOW_CLASS_MAP: Record<string, string> = {

  // ── Submissions ─────────────────────────────────────────────────────────────

  armbar: 'armbar', straight_armbar: 'armbar', belly_down_armbar: 'armbar',
  shoulder_crunch_armbar: 'armbar', arm_isolation: 'armbar', choi_bar: 'armbar',

  heel_hook: 'heel_hook', inside_heel_hook: 'heel_hook',
  outside_heel_hook: 'heel_hook', heel_hook_setup: 'heel_hook',
  heel_hook_transition: 'heel_hook',
  spread_chicken: 'heel_hook', z_lock: 'heel_hook',
  inside_sankaku: 'heel_hook', banana_split: 'heel_hook',

  kimura: 'kimura', kimura_submission: 'kimura',
  rolling_kimura: 'kimura', kimura_trap: 'kimura',
  kimura_to_heel_hook: 'kimura', kimura_rolling_dlr: 'kimura',

  triangle_choke: 'triangle', rear_triangle: 'triangle',
  rear_triangle_choke: 'triangle', back_triangle: 'triangle',
  side_triangle_choke: 'triangle', reverse_triangle: 'triangle',
  reverse_triangle_choke: 'triangle', arm_triangle: 'triangle',
  arm_triangle_choke: 'triangle', mounted_triangle_setup: 'triangle',

  guillotine: 'guillotine', guillotine_choke: 'guillotine',
  arm_in_guillotine: 'guillotine', guillotine_choke_arm_in: 'guillotine',

  omoplata: 'omoplata', flying_omoplata: 'omoplata',
  reverse_omoplata: 'omoplata', omoplata_sweep: 'omoplata',
  baratoplata: 'omoplata', monoplata: 'omoplata', marceloplata: 'omoplata',

  darce_choke: 'darce_choke',

  americana: 'americana', mir_lock: 'americana', shoulder_lock: 'americana',

  rear_naked_choke: 'rear_naked_choke',

  north_south_choke: 'north_south_choke', choke_north_south: 'north_south_choke',

  anaconda_choke: 'anaconda_choke',

  toe_hold: 'toehold', toehold: 'toehold', straight_foot_lock: 'toehold',
  toe_hold_kneebar_transition: 'toehold', texas_cloverleaf: 'toehold',

  ankle_lock: 'ankle_lock', straight_ankle_lock: 'ankle_lock',

  kneebar: 'kneebar',

  baseball_bat_choke: 'baseball_bat_choke', baseball_choke: 'baseball_bat_choke',

  clock_choke: 'clock_choke', worm_hat_choke: 'clock_choke',

  ezekiel_choke: 'ezekiel_choke', arm_in_ezekiel_choke: 'ezekiel_choke',
  choke_lapel_ezekiel: 'ezekiel_choke',

  von_flue_choke: 'von_flue_choke',

  wrist_lock: 'wrist_lock', wristlock: 'wrist_lock',

  calf_slicer: 'calf_slicer', calf_crank: 'calf_slicer', bicep_slicer: 'calf_slicer',

  paper_cutter_choke: 'paper_cutter_choke', bread_cutter_choke: 'paper_cutter_choke',

  twister: 'twister',

  crucifix_choke: 'crucifix_choke', crucifix_submission: 'crucifix_choke',

  kesa_gatame: 'kesa_gatame',

  gogoplata: 'gogoplata', gogo_plata: 'gogoplata',

  // ── Guard types ─────────────────────────────────────────────────────────────

  butterfly_guard_fundamentals: 'butterfly_guard',

  de_la_riva_to_single_leg_x: 'de_la_riva_guard',
  rdlr_hook_release: 'de_la_riva_guard', rdlr_pass: 'de_la_riva_guard',

  single_leg_x: 'single_leg_x_guard',
  single_leg_x_guard_position: 'single_leg_x_guard',

  x_guard: 'x_guard', x_guard_transition: 'x_guard',

  fifty_fifty: 'fifty_fifty_guard',
  backside_50_50_entry: 'fifty_fifty_guard',
  backside_50_50_escape: 'fifty_fifty_guard',

  rubber_guard: 'rubber_guard', rubber_guard_entry: 'rubber_guard',

  worm_guard: 'worm_guard', worm_guard_entry: 'worm_guard',
  worm_guard_setup: 'worm_guard',

  // ── Sweeps ──────────────────────────────────────────────────────────────────

  butterfly_sweep: 'butterfly_sweep',

  x_guard_sweep: 'x_guard_sweep',

  single_leg_x_sweep: 'single_leg_x_sweep', single_leg_x_sweeps: 'single_leg_x_sweep',

  orbit_sweep: 'guard_sweep', double_ankle_sweep: 'guard_sweep',
  lasso_sweep: 'guard_sweep', waiter_sweep: 'guard_sweep',
  k_guard_sweep: 'guard_sweep', swinging_kite_sweep: 'guard_sweep',
  sumi_gaeshi: 'guard_sweep', shoulder_crunch_sweep: 'guard_sweep',

  // ── Transitions ─────────────────────────────────────────────────────────────

  back_take: 'back_take', back_take_2: 'back_take',
  rolling_back_attack: 'back_take',
  '50_50_of_the_arms_back_take': 'back_take',

  guard_pass: 'guard_pass',
}
