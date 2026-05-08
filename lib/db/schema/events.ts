import { pgTable, uuid, text, real, boolean, timestamp } from 'drizzle-orm/pg-core'
import { matches } from './matches'

export const matchEvents = pgTable('match_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id').notNull().references(() => matches.id, { onDelete: 'cascade' }),
  timestampSeconds: real('timestamp_seconds').notNull(),
  eventTypeId: text('event_type_id').notNull(),
  actor: text('actor').notNull(), // user | opponent
  outcome: text('outcome').notNull(), // successful | failed | reversed | ongoing
  techniqueLabel: text('technique_label'),
  confidence: real('confidence').notNull(),
  userCorrected: boolean('user_corrected').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
