ALTER TABLE "player_cards"
  ADD COLUMN "training_plan" jsonb,
  ADD COLUMN "training_plan_generated_at" timestamp;
