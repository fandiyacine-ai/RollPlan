import { db } from '../lib/db/index'
import { sql } from 'drizzle-orm'

async function run() {
  await db.execute(sql`ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS training_plan jsonb`)
  await db.execute(sql`ALTER TABLE player_cards ADD COLUMN IF NOT EXISTS training_plan_generated_at timestamp`)
  console.log('Migration 0030 applied successfully')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
