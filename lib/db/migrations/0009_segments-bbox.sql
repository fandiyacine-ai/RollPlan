ALTER TABLE "position_segments" ADD COLUMN IF NOT EXISTS "user_bbox" jsonb;
ALTER TABLE "position_segments" ADD COLUMN IF NOT EXISTS "opponent_bbox" jsonb;
