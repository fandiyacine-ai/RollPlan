ALTER TABLE "player_cards" ADD COLUMN IF NOT EXISTS "training_plan_status" text NOT NULL DEFAULT 'idle';
