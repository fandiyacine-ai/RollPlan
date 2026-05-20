CREATE TABLE IF NOT EXISTS "canonical_tournaments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "event_date" date,
  "location" text,
  "ruleset" text NOT NULL DEFAULT 'ibjjf',
  "source" text NOT NULL DEFAULT 'other',
  "smoothcomp_url" text,
  "smoothcomp_event_id" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Prevent duplicate Smoothcomp events on re-sync
CREATE UNIQUE INDEX IF NOT EXISTS "canonical_tournaments_smoothcomp_event_id_idx"
  ON "canonical_tournaments" ("smoothcomp_event_id")
  WHERE "smoothcomp_event_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "canonical_tournaments_event_date_idx"
  ON "canonical_tournaments" ("event_date");

-- ── Seed: IBJJF major events 2026 ─────────────────────────────────────────────
-- These live on ibjjf.com — not on Smoothcomp — so they must be seeded manually.
INSERT INTO "canonical_tournaments" ("name", "event_date", "location", "ruleset", "source") VALUES
  ('IBJJF European Open 2026',          '2026-01-19', 'Lisbon, Portugal',          'ibjjf', 'ibjjf'),
  ('IBJJF Miami Open 2026',             '2026-02-07', 'Miami, FL, USA',            'ibjjf', 'ibjjf'),
  ('IBJJF Pan Championship 2026',       '2026-03-18', 'Kissimmee, FL, USA',        'ibjjf', 'ibjjf'),
  ('IBJJF Brazilian Nationals 2026',    '2026-04-22', 'São Paulo, Brazil',         'ibjjf', 'ibjjf'),
  ('IBJJF World Championship 2026',     '2026-06-03', 'Long Beach, CA, USA',       'ibjjf', 'ibjjf'),
  ('IBJJF Rome Open 2026',              '2026-06-27', 'Rome, Italy',               'ibjjf', 'ibjjf'),
  ('IBJJF London Open 2026',            '2026-07-11', 'London, UK',                'ibjjf', 'ibjjf'),
  ('IBJJF Chicago Open 2026',           '2026-08-22', 'Chicago, IL, USA',          'ibjjf', 'ibjjf'),
  ('IBJJF Las Vegas Open 2026',         '2026-09-05', 'Las Vegas, NV, USA',        'ibjjf', 'ibjjf'),
  ('IBJJF Worlds No-Gi 2026',           '2026-10-17', 'Los Angeles, CA, USA',      'ibjjf', 'ibjjf'),
  ('IBJJF European No-Gi Open 2026',    '2026-11-07', 'London, UK',                'ibjjf', 'ibjjf'),
  ('IBJJF Pan No-Gi 2026',              '2026-12-05', 'Las Vegas, NV, USA',        'ibjjf', 'ibjjf'),

-- ── Seed: AJP major events 2026 ───────────────────────────────────────────────
-- AJP runs its own registration and results portal (ajptour.com).
  ('AJP Grand Slam Abu Dhabi 2026',     '2026-04-10', 'Abu Dhabi, UAE',            'ajp',   'ajp'),
  ('AJP World Pro 2026',                '2026-04-25', 'Abu Dhabi, UAE',            'ajp',   'ajp'),
  ('AJP Grand Slam London 2026',        '2026-05-08', 'London, UK',                'ajp',   'ajp'),
  ('AJP Grand Slam Tokyo 2026',         '2026-07-17', 'Tokyo, Japan',              'ajp',   'ajp'),
  ('AJP Grand Slam Paris 2026',         '2026-09-25', 'Paris, France',             'ajp',   'ajp'),

-- ── Seed: ADCC 2026 ───────────────────────────────────────────────────────────
  ('ADCC European Trials 2026',         '2026-02-21', 'Europe (TBC)',              'adcc',  'adcc'),
  ('ADCC North American Trials 2026',   '2026-03-07', 'USA (TBC)',                 'adcc',  'adcc'),
  ('ADCC South American Trials 2026',   '2026-04-04', 'Brazil (TBC)',              'adcc',  'adcc'),
  ('ADCC World Championships 2026',     '2026-09-19', 'TBC',                       'adcc',  'adcc'),

-- ── Seed: Polaris / EBI ───────────────────────────────────────────────────────
  ('Polaris 24',                        '2026-02-28', 'Cardiff, Wales',            'other', 'other'),
  ('Polaris 25',                        '2026-08-01', 'Cardiff, Wales',            'other', 'other'),
  ('EBI Combat Jiu-Jitsu Worlds 2026',  '2026-06-20', 'Los Angeles, CA, USA',      'ebi',   'other')
ON CONFLICT DO NOTHING;
