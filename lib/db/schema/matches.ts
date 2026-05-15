import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'
import { videos } from './videos'

export const matchFormatEnum = pgEnum('match_format', ['gi', 'no_gi'])
export const matchContextEnum = pgEnum('match_context', ['competition', 'sparring', 'drilling'])
export const matchRulesetEnum = pgEnum('match_ruleset', ['ibjjf', 'adcc', 'ebi', 'other'])
export const matchStatusEnum = pgEnum('match_status', ['pending', 'processing', 'analysed', 'failed'])

export const matches = pgTable('matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  videoId: uuid('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  competitorUserId: uuid('competitor_user_id').references(() => users.id),
  competitorLabel: text('competitor_label'),
  opponentLabel: text('opponent_label').notNull(),
  format: matchFormatEnum('format').notNull(),
  context: matchContextEnum('context').notNull().default('competition'),
  ruleset: matchRulesetEnum('ruleset').notNull().default('ibjjf'),
  recordedAt: timestamp('recorded_at'),
  durationSeconds: integer('duration_seconds'),
  status: matchStatusEnum('status').notNull().default('pending'),
  analysisVersion: text('analysis_version'),
  promptVersion: text('prompt_version'),
  eventName: text('event_name'),
  userNotes: text('user_notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
