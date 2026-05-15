CREATE TYPE "public"."belt" AS ENUM('white', 'blue', 'purple', 'brown', 'black');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'athlete', 'athlete_plus', 'coach');--> statement-breakpoint
CREATE TYPE "public"."primary_style" AS ENUM('gi', 'no_gi', 'both');--> statement-breakpoint
CREATE TYPE "public"."video_source" AS ENUM('own_competition', 'own_sparring', 'opponent', 'public_url');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('uploaded', 'processing', 'analysed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."match_context" AS ENUM('competition', 'sparring', 'drilling');--> statement-breakpoint
CREATE TYPE "public"."match_format" AS ENUM('gi', 'no_gi');--> statement-breakpoint
CREATE TYPE "public"."match_ruleset" AS ENUM('ibjjf', 'adcc', 'ebi', 'other');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('pending', 'processing', 'analysed', 'failed');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"belt" "belt",
	"weight_class_kg" integer,
	"primary_style" "primary_style",
	"gym" text,
	"goals" text,
	"token_budget_used" integer DEFAULT 0 NOT NULL,
	"token_budget_limit" integer DEFAULT 500000 NOT NULL,
	"plan_tier" "plan_tier" DEFAULT 'free' NOT NULL,
	"onboarding_complete" text DEFAULT 'false',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"r2_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"duration_seconds" integer,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"thumbnail_r2_key" text,
	"source_type" "video_source" NOT NULL,
	"public_url" text,
	"status" "video_status" DEFAULT 'uploaded' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"competitor_user_id" uuid,
	"competitor_label" text,
	"opponent_label" text NOT NULL,
	"format" "match_format" NOT NULL,
	"context" "match_context" DEFAULT 'competition' NOT NULL,
	"ruleset" "match_ruleset" DEFAULT 'ibjjf' NOT NULL,
	"recorded_at" timestamp,
	"duration_seconds" integer,
	"status" "match_status" DEFAULT 'pending' NOT NULL,
	"analysis_version" text,
	"prompt_version" text,
	"user_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"start_seconds" real NOT NULL,
	"end_seconds" real NOT NULL,
	"position_id" text NOT NULL,
	"user_role" text NOT NULL,
	"dominance" text NOT NULL,
	"confidence" real NOT NULL,
	"user_corrected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"timestamp_seconds" real NOT NULL,
	"event_type_id" text NOT NULL,
	"actor" text NOT NULL,
	"outcome" text NOT NULL,
	"technique_label" text,
	"confidence" real NOT NULL,
	"user_corrected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"suggestion" text NOT NULL,
	"concept_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_segment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" real NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"correction_type" text NOT NULL,
	"corrected_value" jsonb NOT NULL,
	"user_explanation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid,
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
--> statement-breakpoint
CREATE TABLE "tournament_opponents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"opponent_label" text NOT NULL,
	"player_card_id" uuid,
	"seeding_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"event_date" date,
	"division" text,
	"weight_class" text,
	"ruleset" text DEFAULT 'ibjjf' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gameplans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"opponent_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"prompt_version" text NOT NULL,
	"structured_plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gameplan_id" uuid NOT NULL,
	"actual_match_id" uuid NOT NULL,
	"execution_review" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
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
--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_competitor_user_id_users_id_fk" FOREIGN KEY ("competitor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_segments" ADD CONSTRAINT "position_segments_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_cards" ADD CONSTRAINT "player_cards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD CONSTRAINT "tournament_opponents_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD CONSTRAINT "tournament_opponents_player_card_id_player_cards_id_fk" FOREIGN KEY ("player_card_id") REFERENCES "public"."player_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameplans" ADD CONSTRAINT "gameplans_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gameplans" ADD CONSTRAINT "gameplans_opponent_id_tournament_opponents_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."tournament_opponents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_gameplan_id_gameplans_id_fk" FOREIGN KEY ("gameplan_id") REFERENCES "public"."gameplans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_executions" ADD CONSTRAINT "plan_executions_actual_match_id_matches_id_fk" FOREIGN KEY ("actual_match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;