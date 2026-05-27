ALTER TABLE "technique_variants"
  ADD COLUMN IF NOT EXISTS "transcript" text,
  ADD COLUMN IF NOT EXISTS "search_text" text,
  ADD COLUMN IF NOT EXISTS "source_category" text NOT NULL DEFAULT 'instructional',
  ADD COLUMN IF NOT EXISTS "embedding" jsonb;
