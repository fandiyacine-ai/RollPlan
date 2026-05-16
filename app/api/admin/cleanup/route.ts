import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../lib/db'
import {
  aiCallLogs, insights, positionSegments, matchEvents,
  matches, videos,
} from '../../../../lib/db/schema'
import { r2 } from '../../../../lib/storage/r2'
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (req.headers.get('x-cleanup-secret') !== process.env.CLEANUP_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const log: string[] = []

  // Delete all R2 objects
  try {
    const listed = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET_NAME! }))
    const objects = listed.Contents ?? []
    if (objects.length > 0) {
      await r2.send(new DeleteObjectsCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Delete: { Objects: objects.map((o) => ({ Key: o.Key! })) },
      }))
      log.push(`R2: deleted ${objects.length} object(s)`)
    } else {
      log.push('R2: no objects to delete')
    }
  } catch (err) {
    log.push(`R2: failed — ${err instanceof Error ? err.message : String(err)}`)
  }

  // Clear DB tables in dependency order
  const tables = [
    { name: 'ai_call_logs', table: aiCallLogs },
    { name: 'insights', table: insights },
    { name: 'position_segments', table: positionSegments },
    { name: 'match_events', table: matchEvents },
    { name: 'matches', table: matches },
    { name: 'videos', table: videos },
  ]

  for (const { name, table } of tables) {
    try {
      await db.delete(table)
      log.push(`DB: ${name} cleared`)
    } catch (err) {
      log.push(`DB: ${name} failed — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ ok: true, log })
}
