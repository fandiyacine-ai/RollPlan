import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  // 1. Add new columns (idempotent)
  await db.execute(sql`
    ALTER TABLE tournament_opponents
    ADD COLUMN IF NOT EXISTS ajp_athlete_id text,
    ADD COLUMN IF NOT EXISTS ajp_profile_url text
  `)

  // 2. Migrate existing rows where smoothcomp_profile_url points to ajptour.com
  //    → move the AJP ID/URL to the new dedicated columns, clear the shared fields
  const result = await db.execute(sql`
    UPDATE tournament_opponents
    SET
      ajp_athlete_id    = smoothcomp_athlete_id,
      ajp_profile_url   = smoothcomp_profile_url,
      smoothcomp_athlete_id  = NULL,
      smoothcomp_profile_url = NULL
    WHERE smoothcomp_profile_url LIKE '%ajptour.com%'
      AND smoothcomp_athlete_id IS NOT NULL
  `)

  console.log(`Migration complete: added ajp_athlete_id + ajp_profile_url columns`)
  console.log(`Migrated ${(result as any).rowCount ?? 'unknown'} rows from shared field to ajp_athlete_id`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
