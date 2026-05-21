ALTER TABLE tournament_opponents ADD COLUMN IF NOT EXISTS user_result TEXT;
ALTER TABLE tournament_opponents ADD COLUMN IF NOT EXISTS user_result_method TEXT;
ALTER TABLE tournament_opponents ADD COLUMN IF NOT EXISTS user_result_technique TEXT;
