import { db } from '../lib/db/index'
import { sql } from 'drizzle-orm'

async function run() {
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS ajp_athlete_id text,
      ADD COLUMN IF NOT EXISTS ajp_profile_url text,
      ADD COLUMN IF NOT EXISTS ajp_wins integer,
      ADD COLUMN IF NOT EXISTS ajp_losses integer,
      ADD COLUMN IF NOT EXISTS smoothcomp_wins integer,
      ADD COLUMN IF NOT EXISTS smoothcomp_losses integer,
      ADD COLUMN IF NOT EXISTS smoothcomp_fed_url text,
      ADD COLUMN IF NOT EXISTS ibjjf_profile_url text,
      ADD COLUMN IF NOT EXISTS ibjjf_best_result text,
      ADD COLUMN IF NOT EXISTS intel_status text
  `)
  console.log('Migration 0029 applied successfully')
}

run().catch(e => { console.error(e); process.exit(1) })
