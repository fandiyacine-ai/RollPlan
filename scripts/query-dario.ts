import { db } from '../lib/db'
import { positionSegments, matchEvents } from '../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

const MATCH_ID = '085b2ac4-cf2b-4eea-b569-e661b36b22d9'

async function main() {
  const segs = await db.select()
    .from(positionSegments)
    .where(eq(positionSegments.matchId, MATCH_ID))
    .orderBy(asc(positionSegments.startSeconds))

  const events = await db.select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, MATCH_ID))
    .orderBy(asc(matchEvents.timestampSeconds))

  console.log('SEGMENTS:')
  for (const s of segs) {
    console.log(`  ${s.startSeconds}s → ${s.endSeconds}s  ${s.positionId} [${s.userRole}] ${s.dominance} conf=${s.confidence.toFixed(2)}`)
  }
  console.log('\nEVENTS:')
  for (const e of events) {
    console.log(`  ${e.timestampSeconds}s  ${e.eventTypeId} actor=${e.actor} outcome=${e.outcome} ${e.techniqueLabel ?? ''}`)
  }
  console.log('\nTotal clip seconds:', segs[segs.length - 1]?.endSeconds ?? 0)
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
