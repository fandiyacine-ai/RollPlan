import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  await db.execute(sql`
    ALTER TABLE "tournament_opponents"
      ADD COLUMN IF NOT EXISTS "ajp_wins" integer,
      ADD COLUMN IF NOT EXISTS "ajp_losses" integer,
      ADD COLUMN IF NOT EXISTS "smoothcomp_wins" integer,
      ADD COLUMN IF NOT EXISTS "smoothcomp_losses" integer,
      ADD COLUMN IF NOT EXISTS "ibjjf_wins" integer,
      ADD COLUMN IF NOT EXISTS "ibjjf_losses" integer
  `)
  console.log('Migration complete — W/L columns added to tournament_opponents')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
