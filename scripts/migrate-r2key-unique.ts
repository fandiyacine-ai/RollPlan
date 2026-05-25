import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  // CONCURRENTLY avoids a full table lock; cannot run inside a transaction
  await db.execute(sql`
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "videos_r2_key_idx"
    ON "videos" ("r2_key")
  `)
  console.log('Migration complete: unique index on videos.r2_key')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
