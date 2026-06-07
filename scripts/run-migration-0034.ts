import { db } from '../lib/db/index'
import { sql } from 'drizzle-orm'

async function run() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS open_to_connections boolean NOT NULL DEFAULT false`)
  await db.execute(sql`ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS post_event_synced_at timestamp`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tournament_id uuid REFERENCES tournaments(id) ON DELETE SET NULL,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamp NOT NULL DEFAULT now(),
      responded_at timestamp
    )
  `)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS connections_requester_idx ON connections(requester_id)`)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS connections_recipient_idx ON connections(recipient_id)`)
  console.log('Migration 0034 applied successfully')
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
