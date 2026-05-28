import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  rating: integer('rating'),           // 1–5, nullable (text-only submissions allowed)
  category: text('category'),          // 'bug' | 'feature' | 'praise' | 'other'
  message: text('message'),
  page: text('page'),                  // pathname at time of submission
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
