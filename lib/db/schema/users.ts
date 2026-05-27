import { pgTable, uuid, text, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const beltEnum = pgEnum('belt', ['white', 'blue', 'purple', 'brown', 'black', 'grey', 'yellow', 'orange', 'green'])
export const styleEnum = pgEnum('primary_style', ['gi', 'no_gi', 'both'])
export const planTierEnum = pgEnum('plan_tier', ['free', 'athlete', 'athlete_plus', 'coach'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  belt: beltEnum('belt'),
  weightClassKg: integer('weight_class_kg'),
  primaryStyle: styleEnum('primary_style'),
  gym: text('gym'),
  goals: text('goals'),
  tokenBudgetUsed: integer('token_budget_used').notNull().default(0),
  tokenBudgetLimit: integer('token_budget_limit').notNull().default(500000),
  planTier: planTierEnum('plan_tier').notNull().default('free'),
  onboardingComplete: text('onboarding_complete').default('false'),
  smoothcompAthleteId: text('smoothcomp_athlete_id'),
  smoothcompProfileUrl: text('smoothcomp_profile_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
