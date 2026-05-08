import { pgTable, uuid, text, real, boolean, timestamp } from 'drizzle-orm/pg-core'
import { matches } from './matches'

export const positionSegments = pgTable('position_segments', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  startSeconds: real('start_seconds').notNull(),
  endSeconds: real('end_seconds').notNull(),
  positionId: text('position_id').notNull(),
  userRole: text('user_role').notNull(), // top | bottom | neutral | standing
  dominance: text('dominance').notNull(), // dominant | neutral | inferior
  confidence: real('confidence').notNull(),
  userCorrected: boolean('user_corrected').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
