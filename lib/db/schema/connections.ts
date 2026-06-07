import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'
import { tournaments } from './tournaments'

// A connection request between two athletes who actually competed against each
// other (confirmed via tournamentOpponents.userResult, never inferred from a
// bracket entry alone — see ROADMAP "Earned post-competition connections").
// Status stays 'pending' silently on non-response — the requester never learns
// whether it was seen and ignored or genuinely missed.
export const connections = pgTable('connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  respondedAt: timestamp('responded_at'),
})
