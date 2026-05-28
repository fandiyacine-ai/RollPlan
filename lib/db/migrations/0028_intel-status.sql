ALTER TABLE "tournament_opponents" ADD COLUMN IF NOT EXISTS "intel_status" text;
-- All existing opponents pre-date this tracking — treat them as done so they show the Re-run button
UPDATE "tournament_opponents" SET "intel_status" = 'done' WHERE "intel_status" IS NULL;
