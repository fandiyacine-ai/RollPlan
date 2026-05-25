import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  await db.execute(sql`
    ALTER TABLE "tournament_opponents"
      ADD COLUMN IF NOT EXISTS "smoothcomp_fed_url" text,
      ADD COLUMN IF NOT EXISTS "ibjjf_profile_url" text
  `)
  console.log('done')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
