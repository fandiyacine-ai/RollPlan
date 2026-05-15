ALTER TABLE "videos" DROP CONSTRAINT "videos_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;