import { pgTable, uuid, text, date, timestamp } from 'drizzle-orm/pg-core'

export const canonicalTournaments = pgTable('canonical_tournaments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  eventDate: date('event_date'),
  location: text('location'),
  // The ruleset this event uses (ibjjf | ajp | adcc | ebi | other)
  ruleset: text('ruleset').notNull().default('ibjjf'),
  // Where the event is managed/registered (ibjjf | ajp | adcc | smoothcomp | other)
  source: text('source').notNull().default('other'),
  // For Smoothcomp-sourced events
  smoothcompUrl: text('smoothcomp_url'),
  smoothcompEventId: text('smoothcomp_event_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
