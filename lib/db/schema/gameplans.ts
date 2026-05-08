import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { tournaments, tournamentOpponents } from './tournaments'
import { matches } from './matches'

export const gameplans = pgTable('gameplans', {
  id: uuid('id').defaultRandom().primaryKey(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  opponentId: uuid('opponent_id').references(() => tournamentOpponents.id),
  version: integer('version').notNull().default(1),
  promptVersion: text('prompt_version').notNull(),
  structuredPlan: jsonb('structured_plan').notNull().default({}),
  evidence: jsonb('evidence').notNull().default({}),
  status: text('status').notNull().default('draft'), // draft | committed | reviewed
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const planExecutions = pgTable('plan_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  gameplanId: uuid('gameplan_id').notNull().references(() => gameplans.id, { onDelete: 'cascade' }),
  actualMatchId: uuid('actual_match_id').notNull().references(() => matches.id),
  executionReview: jsonb('execution_review').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
