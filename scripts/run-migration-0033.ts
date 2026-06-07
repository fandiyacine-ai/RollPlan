import { db } from '../lib/db/index'
import { sql } from 'drizzle-orm'

async function run() {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS scouted_notified_count integer NOT NULL DEFAULT 0
  `)
  console.log('Migration 0033 applied successfully')
}

run().catch(e => { console.error(e); process.exit(1) })
