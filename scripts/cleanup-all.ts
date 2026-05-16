/**
 * One-shot script: delete all videos from R2 and wipe all analysis data from the DB.
 * Run with: npx tsx scripts/cleanup-all.ts
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { db } from '../lib/db'
import { aiCallLogs, insights, positionSegments, matchEvents, matches, videos } from '../lib/db/schema'

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

async function deleteAllR2Objects() {
  const bucket = process.env.R2_BUCKET_NAME!
  let deleted = 0
  let continuationToken: string | undefined

  do {
    const list = await r2.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }))

    for (const obj of list.Contents ?? []) {
      if (!obj.Key) continue
      await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }))
      console.log(`  deleted R2: ${obj.Key}`)
      deleted++
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined
  } while (continuationToken)

  return deleted
}

async function main() {
  console.log('=== RollPlan full cleanup ===\n')

  // 1. Delete R2 objects
  console.log('1. Deleting R2 objects…')
  const r2Count = await deleteAllR2Objects()
  console.log(`   ${r2Count} object(s) deleted from R2\n`)

  // 2. Wipe DB tables in dependency order (children first)
  console.log('2. Wiping database tables…')
  const logDel   = await db.delete(aiCallLogs)
  console.log(`   ai_call_logs: done`)
  const insDel   = await db.delete(insights)
  console.log(`   insights: done`)
  const segDel   = await db.delete(positionSegments)
  console.log(`   position_segments: done`)
  const evtDel   = await db.delete(matchEvents)
  console.log(`   match_events: done`)
  const matchDel = await db.delete(matches)
  console.log(`   matches: done`)
  const vidDel   = await db.delete(videos)
  console.log(`   videos: done`)

  console.log('\n✓ All clean.')
  process.exit(0)
}

main().catch(err => {
  console.error('Cleanup failed:', err)
  process.exit(1)
})
