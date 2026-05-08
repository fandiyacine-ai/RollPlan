import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { users } from './users'

export const corrections = pgTable('corrections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(), // segment | event | insight
  targetId: uuid('target_id').notNull(),
  correctionType: text('correction_type').notNull(), // wrong_position | wrong_outcome | wrong_technique | disagree
  correctedValue: jsonb('corrected_value').notNull(),
  userExplanation: text('user_explanation'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
