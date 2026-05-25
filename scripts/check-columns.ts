import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  const cols = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'athlete_competition_history'
    ORDER BY ordinal_position
  `)
  console.log('Columns:', JSON.stringify(cols, null, 2))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
