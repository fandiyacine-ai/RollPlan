import { pgTable, uuid, text, integer, real, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const aiCallLogs = pgTable('ai_call_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  jobId: text('job_id'),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  costUsdEstimate: real('cost_usd_estimate').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  status: text('status').notNull(), // success | error
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
