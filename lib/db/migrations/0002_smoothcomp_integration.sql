ALTER TYPE "public"."belt" ADD VALUE 'grey';--> statement-breakpoint
ALTER TYPE "public"."belt" ADD VALUE 'yellow';--> statement-breakpoint
ALTER TYPE "public"."belt" ADD VALUE 'orange';--> statement-breakpoint
ALTER TYPE "public"."belt" ADD VALUE 'green';--> statement-breakpoint
ALTER TYPE "public"."match_ruleset" ADD VALUE 'ajp' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "matches" DROP CONSTRAINT "matches_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "tournament_opponent_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "event_name" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "tournament_opponent_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "spatial_data" jsonb;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "narration" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "share_includes_video" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "result_winner" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "result_method" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "result_technique" text;--> statement-breakpoint
ALTER TABLE "position_segments" ADD COLUMN "user_bbox" jsonb;--> statement-breakpoint
ALTER TABLE "position_segments" ADD COLUMN "opponent_bbox" jsonb;--> statement-breakpoint
ALTER TABLE "insights" ADD COLUMN "youtube_search_query" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "smoothcomp_athlete_id" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "smoothcomp_profile_url" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "smoothcomp_profile_public" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "footage_status" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "smoothcomp_url" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "smoothcomp_event_id" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "bracket_published_at" timestamp;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "bracket_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_tournament_opponent_id_tournament_opponents_id_fk" FOREIGN KEY ("tournament_opponent_id") REFERENCES "public"."tournament_opponents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_opponent_id_tournament_opponents_id_fk" FOREIGN KEY ("tournament_opponent_id") REFERENCES "public"."tournament_opponents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_share_token_unique" UNIQUE("share_token");