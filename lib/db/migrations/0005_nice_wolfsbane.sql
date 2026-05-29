CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"rating" integer,
	"category" text,
	"message" text,
	"page" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "smoothcomp_athlete_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "smoothcomp_profile_url" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "reference_image_url" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "user_side" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ajp_athlete_id" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ajp_profile_url" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ajp_wins" integer;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ajp_losses" integer;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "smoothcomp_wins" integer;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "smoothcomp_losses" integer;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "smoothcomp_fed_url" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ibjjf_wins" integer;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ibjjf_losses" integer;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ibjjf_profile_url" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "ibjjf_best_result" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "intel_status" text;--> statement-breakpoint
ALTER TABLE "tournament_opponents" ADD COLUMN "profile_photo_url" text;--> statement-breakpoint
ALTER TABLE "technique_variants" ADD COLUMN "transcript" text;--> statement-breakpoint
ALTER TABLE "technique_variants" ADD COLUMN "search_text" text;--> statement-breakpoint
ALTER TABLE "technique_variants" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "technique_variants" ADD COLUMN "source_category" text DEFAULT 'instructional' NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "videos_r2_key_idx" ON "videos" USING btree ("r2_key");