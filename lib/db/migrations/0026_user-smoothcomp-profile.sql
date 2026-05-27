ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "smoothcomp_athlete_id" text,
  ADD COLUMN IF NOT EXISTS "smoothcomp_profile_url" text;
