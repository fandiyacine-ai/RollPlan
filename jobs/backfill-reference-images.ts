import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { isNull, isNotNull, like, eq } from 'drizzle-orm'
import ytdl from '@distube/ytdl-core'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { techniqueVariants } from '../lib/db/schema'
import { uploadBuffer, getPublicVideoUrl } from '../lib/storage/r2'

function parseKeyMomentSeconds(adminNotes: string): number | null {
  const match = adminNotes.match(/Key moment: (\d+):(\d{2})/)
  if (!match) return null
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
}

// Fan-out trigger: find all variants missing referenceImageUrl and fire one event per record
export const backfillReferenceImages = inngest.createFunction(
  {
    id: 'backfill-reference-images',
    name: 'Backfill Reference Images for Technique Variants',
    triggers: [{ event: 'admin/backfill-reference-images.requested' }],
    concurrency: { limit: 1 },
  },
  async ({ step }: { step: any }) => {
    const candidates = await step.run('find-candidates', async () => {
      const rows = await db.query.techniqueVariants.findMany({
        where: (t, { and, isNull, isNotNull }) =>
          and(isNull(t.referenceImageUrl), isNotNull(t.sourceUrl)),
        columns: { id: true, sourceUrl: true, adminNotes: true },
      })
      return rows.map(r => ({
        id: r.id,
        sourceUrl: r.sourceUrl!,
        // Fall back to 30s when Gemini returned null — any frame beats none
        keyMomentSeconds: (r.adminNotes ? parseKeyMomentSeconds(r.adminNotes) : null) ?? 30,
      }))
    })

    if (candidates.length === 0) return { dispatched: 0 }

    await step.sendEvent(
      'fan-out-frames',
      candidates.map((c: { id: string; sourceUrl: string; keyMomentSeconds: number | null }) => ({
        name: 'technique/backfill-frame.requested',
        data: { id: c.id, sourceUrl: c.sourceUrl, keyMomentSeconds: c.keyMomentSeconds },
      })),
    )

    return { dispatched: candidates.length }
  },
)

// Per-record handler: extract frame, upload to R2, write back
export const backfillReferenceImageOne = inngest.createFunction(
  {
    id: 'backfill-reference-image-one',
    name: 'Backfill Reference Image (one variant)',
    triggers: [{ event: 'technique/backfill-frame.requested' }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }: { event: { data: { id: string; sourceUrl: string; keyMomentSeconds: number } }; step: any }) => {
    const { id, sourceUrl, keyMomentSeconds } = event.data

    const refImageUrl = await step.run('extract-frame', async () => {
      try {
        const info = await ytdl.getInfo(sourceUrl)
        const format = ytdl.chooseFormat(info.formats, {
          quality: 'lowestvideo',
          filter: (f: any) => !!f.url && f.hasVideo && (f.container === 'mp4' || f.container === 'webm'),
        }) || ytdl.chooseFormat(info.formats, {
          quality: 'lowestvideo',
          filter: (f: any) => !!f.url && f.hasVideo,
        })
        if (!format?.url) {
          console.error('[backfill-reference-images] no downloadable video format found for', sourceUrl)
          return null
        }

        const tmpDir = mkdtempSync(join(tmpdir(), 'rp-ref-'))
        const outPath = join(tmpDir, 'frame.jpg')
        try {
          const result = spawnSync('ffmpeg', [
            '-loglevel', 'error',
            '-y',
            '-ss', String(Math.floor(keyMomentSeconds)),
            '-i', format.url,
            '-frames:v', '1',
            '-q:v', '3',
            '-vf', 'scale=1280:-2',
            outPath,
          ], { timeout: 30_000 })

          if (result.status !== 0 || !existsSync(outPath)) {
            console.error('[backfill-reference-images] ffmpeg failed', { sourceUrl, status: result.status, stderr: result.stderr?.toString(), stdout: result.stdout?.toString() })
            return null
          }

          const buffer = readFileSync(outPath)
          const r2Key = `technique-refs/${id}.jpg`
          await uploadBuffer(r2Key, buffer, 'image/jpeg')
          return await getPublicVideoUrl(r2Key)
        } finally {
          rmSync(tmpDir, { recursive: true, force: true })
        }
      } catch (err) {
        console.error('[backfill-reference-images] failed to extract frame', err)
        return null
      }
    })

    if (refImageUrl) {
      await step.run('save-url', async () => {
        await db.update(techniqueVariants)
          .set({ referenceImageUrl: refImageUrl, updatedAt: new Date() })
          .where(eq(techniqueVariants.id, id))
      })
    }

    return { id, success: !!refImageUrl }
  },
)
