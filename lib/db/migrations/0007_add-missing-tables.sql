-- Create ai_call_logs if not yet created by init
CREATE TABLE IF NOT EXISTS "ai_call_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "public"."users"("id") ON DELETE no action,
  "job_id" text,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "tokens_in" integer NOT NULL,
  "tokens_out" integer NOT NULL,
  "cost_usd_estimate" real NOT NULL,
  "latency_ms" integer NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create player_cards if not yet created by init
CREATE TABLE IF NOT EXISTS "player_cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid REFERENCES "public"."users"("id") ON DELETE cascade,
  "owner_label" text,
  "computed_at" timestamp DEFAULT now() NOT NULL,
  "based_on_match_count" integer DEFAULT 0 NOT NULL,
  "aggregate_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "top_strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "top_weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "preferred_positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "preferred_attacks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "narrative_summary" text,
  "prompt_version" text
);

-- Create tournaments if not yet created by init
CREATE TABLE IF NOT EXISTS "tournaments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "event_date" date,
  "division" text,
  "weight_class" text,
  "ruleset" text DEFAULT 'ibjjf' NOT NULL,
  "notes" text,
  "status" text DEFAULT 'upcoming' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create tournament_opponents if not yet created by init
CREATE TABLE IF NOT EXISTS "tournament_opponents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "public"."tournaments"("id") ON DELETE cascade,
  "opponent_label" text NOT NULL,
  "player_card_id" uuid REFERENCES "public"."player_cards"("id") ON DELETE no action,
  "seeding_notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create gameplans if not yet created by init
CREATE TABLE IF NOT EXISTS "gameplans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tournament_id" uuid NOT NULL REFERENCES "public"."tournaments"("id") ON DELETE cascade,
  "opponent_id" uuid REFERENCES "public"."tournament_opponents"("id") ON DELETE no action,
  "version" integer DEFAULT 1 NOT NULL,
  "prompt_version" text NOT NULL,
  "structured_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create plan_executions if not yet created by init
CREATE TABLE IF NOT EXISTS "plan_executions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gameplan_id" uuid NOT NULL REFERENCES "public"."gameplans"("id") ON DELETE cascade,
  "actual_match_id" uuid NOT NULL REFERENCES "public"."matches"("id") ON DELETE no action,
  "execution_review" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Add tournament_opponent_id to matches (was in 0006 which failed due to missing table above)
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "tournament_opponent_id" uuid REFERENCES "public"."tournament_opponents"("id") ON DELETE SET NULL;
