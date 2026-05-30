ALTER TABLE "users"
  ADD COLUMN "ajp_athlete_id" text,
  ADD COLUMN "ajp_profile_url" text,
  ADD COLUMN "ajp_wins" integer,
  ADD COLUMN "ajp_losses" integer,
  ADD COLUMN "smoothcomp_wins" integer,
  ADD COLUMN "smoothcomp_losses" integer,
  ADD COLUMN "smoothcomp_fed_url" text,
  ADD COLUMN "ibjjf_profile_url" text,
  ADD COLUMN "ibjjf_best_result" text,
  ADD COLUMN "intel_status" text;
