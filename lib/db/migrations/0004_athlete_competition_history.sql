CREATE TABLE "canonical_tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"event_date" date,
	"location" text,
	"ruleset" text DEFAULT 'ibjjf' NOT NULL,
	"source" text DEFAULT 'other' NOT NULL,
	"smoothcomp_url" text,
	"smoothcomp_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technique_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"position_id" text,
	"name" text NOT NULL,
	"format" text DEFAULT 'both' NOT NULL,
	"visual_cues" text NOT NULL,
	"counters" text,
	"reference_image_url" text,
	"source_url" text,
	"source_label" text,
	"extracted_by_model" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "athlete_competition_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"smoothcomp_athlete_id" text NOT NULL,
	"tournament_opponent_id" uuid,
	"federation" text DEFAULT 'smoothcomp' NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text,
	"event_url" text,
	"event_date" date,
	"placement" text,
	"wins" integer,
	"losses" integer,
	"submission_wins" integer,
	"points_wins" integer,
	"submission_losses" integer,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_competition_history_tournament_opponent_id_event_id_unique" UNIQUE("tournament_opponent_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "match_start_seconds" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "match_end_seconds" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "kb_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "kb_upgraded_at" timestamp;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "kb_upgrade_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "kb_changelog" jsonb;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "user_result" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "user_result_method" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "user_result_technique" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "post_event_notes" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "canonical_tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "gameplans" ADD COLUMN "prediction" jsonb;--> statement-breakpoint
ALTER TABLE "gameplans" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_competition_history" ADD CONSTRAINT "athlete_competition_history_tournament_opponent_id_tournament_opponents_id_fk" FOREIGN KEY ("tournament_opponent_id") REFERENCES "public"."tournament_opponents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_canonical_tournament_id_canonical_tournaments_id_fk" FOREIGN KEY ("canonical_tournament_id") REFERENCES "public"."canonical_tournaments"("id") ON DELETE set null ON UPDATE no action;