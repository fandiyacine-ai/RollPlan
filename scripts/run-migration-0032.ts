import { db } from '../lib/db/index'
import { sql } from 'drizzle-orm'

async function run() {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS cap_email_sent_at timestamp
  `)
  console.log('Migration 0032 applied successfully')
}

run().catch(e => { console.error(e); process.exit(1) })
