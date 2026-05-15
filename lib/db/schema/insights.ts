import { pgTable, uuid, text, real, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { matches } from './matches'

export const insights = pgTable('insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // strength | mistake | opportunity | pattern
  severity: text('severity').notNull(), // critical | moderate | minor
  description: text('description').notNull(),
  suggestion: text('suggestion').notNull(),
  conceptTags: jsonb('concept_tags').notNull().default([]), // string[]
  evidenceSegmentIds: jsonb('evidence_segment_ids').notNull().default([]), // string[]
  evidenceEventIds: jsonb('evidence_event_ids').notNull().default([]), // string[]
  confidence: real('confidence').notNull(),
  youtubeSearchQuery: text('youtube_search_query'),
  promptVersion: text('prompt_version').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
