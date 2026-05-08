import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { users } from './users'

export const videoSourceEnum = pgEnum('video_source', ['own_competition', 'own_sparring', 'opponent', 'public_url'])
export const videoStatusEnum = pgEnum('video_status', ['uploaded', 'processing', 'analysed', 'failed'])

export const videos = pgTable('videos', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  r2Key: text('r2_key').notNull(),
  originalFilename: text('original_filename').notNull(),
  durationSeconds: integer('duration_seconds'),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  thumbnailR2Key: text('thumbnail_r2_key'),
  sourceType: videoSourceEnum('source_type').notNull(),
  publicUrl: text('public_url'),
  status: videoStatusEnum('status').notNull().default('uploaded'),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
})
