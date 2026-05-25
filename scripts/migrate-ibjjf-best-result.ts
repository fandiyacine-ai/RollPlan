import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  await db.execute(sql`ALTER TABLE tournament_opponents ADD COLUMN IF NOT EXISTS ibjjf_best_result TEXT`)
  console.log('Migration complete: ibjjf_best_result column added')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
