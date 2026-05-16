import { config } from 'dotenv'
config({ path: '.env.local' })
import { db } from '../lib/db'
import { videos, matches } from '../lib/db/schema'

async function main() {
  const v = await db.select({ id: videos.id, r2Key: videos.r2Key, publicUrl: videos.publicUrl, source: videos.sourceType }).from(videos)
  const m = await db.select({ id: matches.id, status: matches.status }).from(matches)
  console.log('Videos:', JSON.stringify(v, null, 2))
  console.log('Match count:', m.length)
  process.exit(0)
}
main()
