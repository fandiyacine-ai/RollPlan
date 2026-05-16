import { NextRequest } from 'next/server'
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { db } from '../../../../lib/db'
import { aiCallLogs, insights, positionSegments, matchEvents, matches, videos } from '../../../../lib/db/schema'

export const maxDuration = 60

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cleanup-secret')
  if (secret !== process.env.CLEANUP_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const log: string[] = []

  // 1. Delete all R2 objects
  let r2Deleted = 0
  try {
    let continuationToken: string | undefined
    do {
      const list = await r2.send(new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME!,
        ContinuationToken: continuationToken,
      }))
      for (const obj of list.Contents ?? []) {
        if (!obj.Key) continue
        await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: obj.Key }))
        r2Deleted++
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
    } while (continuationToken)
    log.push(`R2: deleted ${r2Deleted} object(s)`)
  } catch (err) {
    log.push(`R2: failed — ${err}`)
  }

  // 2. Wipe DB tables in dependency order
  await db.delete(aiCallLogs);  log.push('DB: ai_call_logs cleared')
  await db.delete(insights);    log.push('DB: insights cleared')
  await db.delete(positionSegments); log.push('DB: position_segments cleared')
  await db.delete(matchEvents); log.push('DB: match_events cleared')
  await db.delete(matches);     log.push('DB: matches cleared')
  await db.delete(videos);      log.push('DB: videos cleared')

  return new Response(JSON.stringify({ ok: true, log }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
