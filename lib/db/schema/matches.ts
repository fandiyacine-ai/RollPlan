import { pgTable, uuid, text, integer, timestamp, pgEnum, jsonb, boolean } from 'drizzle-orm/pg-core'
import { users } from './users'
import { videos } from './videos'
import { tournamentOpponents } from './tournaments'

export const matchFormatEnum = pgEnum('match_format', ['gi', 'no_gi'])
export const matchContextEnum = pgEnum('match_context', ['competition', 'sparring', 'drilling'])
export const matchRulesetEnum = pgEnum('match_ruleset', ['ibjjf', 'adcc', 'ebi', 'ajp', 'other'])
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
  tournamentOpponentId: uuid('tournament_opponent_id').references(() => tournamentOpponents.id, { onDelete: 'set null' }),
  spatialData: jsonb('spatial_data'), // { roi: {x1,y1,x2,y2}, athlete: {x,y} } — from frame selector
  narration: text('narration'),
  shareToken: text('share_token').unique(),
  shareIncludesVideo: boolean('share_includes_video').default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
