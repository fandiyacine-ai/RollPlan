ALTER TABLE users ADD COLUMN IF NOT EXISTS scouted_notified_count integer NOT NULL DEFAULT 0;
