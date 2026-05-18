ALTER TABLE "matches" ADD COLUMN "share_token" text UNIQUE;
ALTER TABLE "matches" ADD COLUMN "share_includes_video" boolean DEFAULT false;
