import { pgTable, uuid, text, date, integer, timestamp, unique } from 'drizzle-orm/pg-core'
import { tournamentOpponents } from './tournaments'

export const athleteCompetitionHistory = pgTable('athlete_competition_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Source identity — smoothcompAthleteId is the stable cross-tournament key
  smoothcompAthleteId: text('smoothcomp_athlete_id').notNull(),
  // Which opponent record this was scraped for (cascade delete when opponent removed)
  tournamentOpponentId: uuid('tournament_opponent_id')
    .references(() => tournamentOpponents.id, { onDelete: 'cascade' }),
  federation: text('federation').notNull().default('smoothcomp'), // 'smoothcomp' | 'ajp' | 'ibjjf'
  eventName: text('event_name').notNull(),
  eventId: text('event_id'),
  eventUrl: text('event_url'),
  eventDate: date('event_date'),
  placement: text('placement'),         // '1st', '2nd', 'bronze', 'eliminated_r1', etc.
  // Match stats — populated when bracket is also scraped (Phase 2)
  wins: integer('wins'),
  losses: integer('losses'),
  submissionWins: integer('submission_wins'),
  pointsWins: integer('points_wins'),
  submissionLosses: integer('submission_losses'),
  // Source metadata
  scrapedAt: timestamp('scraped_at').notNull().defaultNow(),
}, (t) => ({
  // Prevent duplicate rows if the discover job re-runs for the same opponent+event
  uniqOpponentEvent: unique().on(t.tournamentOpponentId, t.eventId),
}))
