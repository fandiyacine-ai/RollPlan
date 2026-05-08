import { pgTable, uuid, text, date, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'
import { playerCards } from './player-cards'

export const tourStatusEnum = ['upcoming', 'completed', 'cancelled'] as const

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
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const tournamentOpponents = pgTable('tournament_opponents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  opponentLabel: text('opponent_label').notNull(),
  playerCardId: uuid('player_card_id').references(() => playerCards.id),
  seedingNotes: text('seeding_notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
