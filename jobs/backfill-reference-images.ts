import { spawn } from 'child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { eq } from 'drizzle-orm'
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
      const tmpDir = mkdtempSync(join(tmpdir(), 'rp-ref-'))
      const outPath = join(tmpDir, 'frame.jpg')
      try {
        // Pipe ytdl stream directly into ffmpeg stdin so YouTube's streaming URL
        // auth tokens stay intact — passing the URL to ffmpeg directly fails because
        // YouTube rejects requests from a different user-agent/IP.
        const stream = ytdl(sourceUrl, {
          quality: 'lowestvideo',
          filter: (f: any) => f.hasVideo,
        })

        const stderrChunks: Buffer[] = []

        await new Promise<void>((resolve, reject) => {
          const ff = spawn('ffmpeg', [
            '-y',
            '-loglevel', 'error',
            '-ss', String(Math.floor(keyMomentSeconds)),
            '-i', 'pipe:0',
            '-frames:v', '1',
            '-q:v', '3',
            '-vf', 'scale=1280:-2',
            outPath,
          ])

          ff.stderr.on('data', (d: Buffer) => stderrChunks.push(d))

          // EPIPE is expected once ffmpeg extracts its frame and closes stdin early
          ff.stdin.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code !== 'EPIPE') reject(err)
          })

          stream.on('error', (err) => { ff.kill(); reject(err) })
          stream.pipe(ff.stdin)

          // 50s hard timeout — the Inngest step will also enforce its own limit
          const timer = setTimeout(() => { ff.kill(); reject(new Error('extraction timeout')) }, 50_000)

          ff.on('close', (code) => {
            clearTimeout(timer)
            if (code === 0) resolve()
            else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderrChunks).toString()}`))
          })
          ff.on('error', (err) => { clearTimeout(timer); reject(err) })
        })

        if (!existsSync(outPath)) {
          console.error('[backfill-reference-images] ffmpeg succeeded but output missing', sourceUrl)
          return null
        }

        const buffer = readFileSync(outPath)
        const r2Key = `technique-refs/${id}.jpg`
        await uploadBuffer(r2Key, buffer, 'image/jpeg')
        return await getPublicVideoUrl(r2Key)
      } catch (err) {
        // Throw so Inngest retries the step instead of silently skipping
        throw err
      } finally {
        rmSync(tmpDir, { recursive: true, force: true })
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
