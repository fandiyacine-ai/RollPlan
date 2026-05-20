ALTER TABLE "tournaments"
  ADD COLUMN IF NOT EXISTS "canonical_tournament_id" uuid
  REFERENCES "canonical_tournaments"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "tournaments_canonical_tournament_id_idx"
  ON "tournaments" ("canonical_tournament_id")
  WHERE "canonical_tournament_id" IS NOT NULL;
