import { pgTable, uuid, text, date, timestamp, integer } from 'drizzle-orm/pg-core'
import { users } from './users'
import { playerCards } from './player-cards'
import { canonicalTournaments } from './canonical-tournaments'

export const tourStatusEnum = ['upcoming', 'completed', 'cancelled'] as const

// Tracks how an opponent's footage was sourced
// pending     — bracket imported, footage discovery not yet run
// auto_queued — past footage found on Smoothcomp, analysis running
// auto_ready  — auto-discovered analysis complete, gameplan available
// no_footage  — profile public but no recordings found, OR profile private
// reused      — footage reused from a previous tournament's scouting
// manual      — user added footage manually
export const opponentFootageStatusEnum = ['pending', 'auto_queued', 'auto_ready', 'no_footage', 'reused', 'manual'] as const

export const tournaments = pgTable('tournaments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  eventDate: date('event_date'),
  division: text('division'),
  weightClass: text('weight_class'),
  ruleset: text('ruleset').notNull().default('ibjjf'),
  notes: text('notes'),
  status: text('status').notNull().default('upcoming'),
  // Smoothcomp integration
  smoothcompUrl: text('smoothcomp_url'),
  smoothcompEventId: text('smoothcomp_event_id'),
  bracketPublishedAt: timestamp('bracket_published_at'),
  bracketFetchedAt: timestamp('bracket_fetched_at'),
  // Post-event engagement
  outcome: text('outcome'),              // 'gold' | 'silver' | 'bronze' | 'eliminated' | 'dns' | null
  postEventNotes: text('post_event_notes'),
  // Catalog link — set when tournament is created from the event catalog
  canonicalTournamentId: uuid('canonical_tournament_id').references(() => canonicalTournaments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const tournamentOpponents = pgTable('tournament_opponents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  opponentLabel: text('opponent_label').notNull(),
  playerCardId: uuid('player_card_id').references(() => playerCards.id),
  seedingNotes: text('seeding_notes'),
  // Smoothcomp integration
  smoothcompAthleteId: text('smoothcomp_athlete_id'),
  smoothcompProfileUrl: text('smoothcomp_profile_url'),
  smoothcompProfilePublic: text('smoothcomp_profile_public'), // 'yes' | 'no' | null = unknown
  footageStatus: text('footage_status').notNull().default('manual'),
  // User's actual result against this opponent at the tournament
  userResult: text('user_result'),         // 'win' | 'loss' | 'draw' | null
  userResultMethod: text('user_result_method'), // 'submission' | 'points' | 'dq' | 'walkover' | null
  userResultTechnique: text('user_result_technique'), // e.g. 'rear naked choke' | null
  // Career W/L totals + profile links per federation — computed by the scout job
  ajpWins: integer('ajp_wins'),
  ajpLosses: integer('ajp_losses'),
  smoothcompWins: integer('smoothcomp_wins'),
  smoothcompLosses: integer('smoothcomp_losses'),
  smoothcompFedUrl: text('smoothcomp_fed_url'),   // Smoothcomp federation profile URL
  ibjjfWins: integer('ibjjf_wins'),
  ibjjfLosses: integer('ibjjf_losses'),
  ibjjfProfileUrl: text('ibjjf_profile_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
