ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_winner" text;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_method" text;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "result_technique" text;
