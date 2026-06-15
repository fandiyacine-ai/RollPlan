import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { getActiveTechniqueVariants } from '@/lib/ai/technique-retrieval'
import { classifyDrillCategory, classifyDifficulty } from '@/lib/taxonomy/drill-metadata'
import { EVENT_TYPES } from '@/lib/taxonomy/events'
import { POSITIONS } from '@/lib/taxonomy/positions'
import { DrillLibrary, type Drill } from './drill-library'

export const dynamic = 'force-dynamic'

const EVENT_NAME_MAP = Object.fromEntries(EVENT_TYPES.map(e => [e.id, e.name]))
const POSITION_NAME_MAP = Object.fromEntries(POSITIONS.map(p => [p.id, p.name]))

function humanize(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default async function DrillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const userId = await getOrCreateDbUserId()
  const dbUser = await db.query.users.findFirst({ where: eq(users.id, userId) })

  const variants = await getActiveTechniqueVariants()

  const drills: Drill[] = variants.map(v => ({
    id: v.id,
    name: v.name,
    eventName: EVENT_NAME_MAP[v.eventId] ?? humanize(v.eventId),
    positionName: v.positionId ? (POSITION_NAME_MAP[v.positionId] ?? humanize(v.positionId)) : null,
    format: v.format,
    visualCues: v.visualCues,
    counters: v.counters,
    sourceUrl: v.sourceUrl,
    category: classifyDrillCategory(v.eventId, v.positionId),
    difficulty: classifyDifficulty(v.eventId, v.positionId),
  }))

  return <DrillLibrary drills={drills} userBelt={dbUser?.belt ?? null} initialSearch={q} />
}
