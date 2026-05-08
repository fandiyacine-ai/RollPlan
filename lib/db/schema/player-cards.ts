import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'

export const playerCards = pgTable('player_cards', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerType: text('owner_type').notNull(), // user | opponent_label
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  ownerLabel: text('owner_label'),
  computedAt: timestamp('computed_at').notNull().defaultNow(),
  basedOnMatchCount: integer('based_on_match_count').notNull().default(0),
  aggregateStats: jsonb('aggregate_stats').notNull().default({}),
  topStrengths: jsonb('top_strengths').notNull().default([]),
  topWeaknesses: jsonb('top_weaknesses').notNull().default([]),
  preferredPositions: jsonb('preferred_positions').notNull().default([]),
  preferredAttacks: jsonb('preferred_attacks').notNull().default([]),
  narrativeSummary: text('narrative_summary'),
  promptVersion: text('prompt_version'),
})
