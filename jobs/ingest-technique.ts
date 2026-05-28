import { spawn } from 'child_process'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { eq } from 'drizzle-orm'
import ytdl from '@distube/ytdl-core'
import ffmpegStaticPath from 'ffmpeg-static'
// nixpacks installs system ffmpeg — prefer it; fall back to ffmpeg-static for local dev
const ffmpegBin: string = ffmpegStaticPath ?? 'ffmpeg'
import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { techniqueVariants, aiCallLogs } from '../lib/db/schema'
import { google, GEMINI_VIDEO_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { TechniqueExtractionOutputSchema } from '../lib/ai/schemas/technique-extraction'
import { buildExtractTechniqueSystemPrompt, buildExtractTechniqueUserPrompt, EXTRACT_TECHNIQUE_PROMPT_VERSION } from '../lib/ai/prompts/extract-technique'
import { embedText } from '../lib/ai/embeddings'
import { uploadBuffer, getPublicVideoUrl } from '../lib/storage/r2'

export const ingestTechnique = inngest.createFunction(
  {
    id: 'ingest-technique',
    name: 'Ingest Technique from Instructional Video',
    triggers: [{ event: 'technique/ingest-requested' }],
  },
  async ({ event, step }: {
    event: {
      data: {
        youtubeUrl: string
        techniqueHint?: string   // e.g. "armbar from mount"
        positionHint?: string    // e.g. "mount"
        requestedByUserId: string
        sourceCategory?: 'instructional' | 'analysis'
        includeTranscript?: boolean
      }
    }
    step: any
  }) => {
    const { youtubeUrl, techniqueHint, positionHint, requestedByUserId, sourceCategory, includeTranscript } = event.data

    // Fetch transcript when requested (best-effort). Use transcripts to help extraction.
    let transcript: string | null = null
    if (includeTranscript !== false) {
      try {
        const yt = await import('../lib/youtube')
        transcript = await yt.fetchYouTubeTranscript(youtubeUrl)
      } catch {
        transcript = null
      }
    }

    const { object, usage } = await step.run('extract-technique-gemini', async () => {
      const start = Date.now()

      // Gemini can process YouTube URLs directly — include transcript as an extra text part
      const contentParts: any[] = []
      contentParts.push({
        type: 'file',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: new URL(youtubeUrl) as any,
        mediaType: 'video/mp4',
      })
      if (transcript) {
        contentParts.push({ type: 'text', text: `TRANSCRIPT:\n${transcript.substring(0, 60_000)}` })
      }
      contentParts.push({ type: 'text', text: buildExtractTechniqueUserPrompt({ techniqueHint, positionHint }) })

      const result = await generateObject({
        model: google(GEMINI_VIDEO_MODEL),
        schema: TechniqueExtractionOutputSchema,
        maxRetries: 0,
        system: buildExtractTechniqueSystemPrompt(),
        messages: [{ role: 'user', content: contentParts }],
      })

      await db.insert(aiCallLogs).values({
        userId: null,
        jobId: youtubeUrl,
        model: GEMINI_VIDEO_MODEL,
        promptVersion: EXTRACT_TECHNIQUE_PROMPT_VERSION,
        tokensIn: result.usage.inputTokens ?? 0,
        tokensOut: result.usage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0),
        latencyMs: Date.now() - start,
        status: 'success',
      })

      return { object: result.object, usage: result.usage }
    })

    const variantId = await step.run('create-draft-record', async () => {
      // Auto-approve when Gemini is confident: high source quality + substantial visual cues
      const autoApprove = object.source_quality === 'high' && object.visual_cues.length >= 200
      const status = autoApprove ? 'active' : 'draft'

      const searchTextPieces = [object.name, object.visual_cues, transcript ?? ''].filter(Boolean)
      const searchText = searchTextPieces.join('\n')
      const truncatedSearchText = searchText.substring(0, 10000) || null
      let embedding: number[] | null = null
      if (truncatedSearchText) {
        try {
          embedding = await embedText(truncatedSearchText)
        } catch {
          embedding = null
        }
      }

      const [record] = await db.insert(techniqueVariants).values({
        eventId: object.event_id,
        positionId: object.position_id ?? null,
        name: object.name,
        format: object.format,
        visualCues: object.visual_cues,
        counters: object.counters ?? null,
        transcript: transcript ?? null,
        searchText: truncatedSearchText,
        embedding,
        sourceUrl: youtubeUrl,
        sourceLabel: techniqueHint ?? object.name,
        sourceCategory: sourceCategory ?? 'instructional',
        extractedByModel: GEMINI_VIDEO_MODEL,
        status,
        adminNotes: [
          autoApprove ? 'Auto-approved (high quality)' : '',
          object.extraction_notes ?? '',
          `Source quality: ${object.source_quality}`,
          object.key_moment_seconds != null ? `Key moment: ${Math.floor(object.key_moment_seconds / 60)}:${String(Math.floor(object.key_moment_seconds % 60)).padStart(2, '0')}` : '',
        ].filter(Boolean).join(' | ') || null,
      }).returning({ id: techniqueVariants.id })

      return { id: record.id, status }
    })

    // Extract a reference frame at the key moment and upload to R2
    if (object.key_moment_seconds != null) {
      const refImageUrl = await step.run('extract-reference-image', async () => {
        try {
          const tmpDir = mkdtempSync(join(tmpdir(), 'rp-ref-'))
          const outPath = join(tmpDir, 'frame.jpg')
          try {
            const stream = ytdl(youtubeUrl, {
              filter: (f: any) => f.hasVideo && (!f.height || f.height <= 480),
            })

            const stderrChunks: Buffer[] = []
            await new Promise<void>((resolve, reject) => {
              const ff = spawn(ffmpegBin, [
                '-y',
                '-loglevel', 'error',
                '-ss', String(Math.floor(object.key_moment_seconds!)),
                '-i', 'pipe:0',
                '-frames:v', '1',
                '-q:v', '3',
                '-vf', 'scale=1280:-2',
                outPath,
              ])

              ff.stderr.on('data', (d: Buffer) => stderrChunks.push(d))
              ff.stdin.on('error', (err: NodeJS.ErrnoException) => {
                if (err.code !== 'EPIPE') reject(err)
              })
              stream.on('error', (err: Error) => { ff.kill(); reject(err) })
              stream.pipe(ff.stdin)

              const timer = setTimeout(() => { ff.kill(); reject(new Error('extraction timeout')) }, 50_000)
              ff.on('close', (code: number | null) => {
                clearTimeout(timer)
                if (code === 0) resolve()
                else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderrChunks).toString()}`))
              })
              ff.on('error', (err: Error) => { clearTimeout(timer); reject(err) })
            })

            const buffer = readFileSync(outPath)
            const r2Key = `technique-refs/${variantId.id}.jpg`
            await uploadBuffer(r2Key, buffer, 'image/jpeg')
            return await getPublicVideoUrl(r2Key)
          } finally {
            rmSync(tmpDir, { recursive: true, force: true })
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[ingest-technique] failed to extract reference image', err)
          return { error: msg.slice(0, 300) }
        }
      })

      if (refImageUrl && typeof refImageUrl === 'string') {
        await step.run('save-reference-image', async () => {
          await db.update(techniqueVariants)
            .set({ referenceImageUrl: refImageUrl, updatedAt: new Date() })
            .where(eq(techniqueVariants.id, variantId.id))
        })
      } else {
        await step.run('record-ref-image-failure', async () => {
          const existing = await db.query.techniqueVariants.findFirst({
            columns: { adminNotes: true },
            where: eq(techniqueVariants.id, variantId.id),
          })
          const errMsg = refImageUrl && typeof refImageUrl === 'object' && 'error' in refImageUrl
            ? ` — ${(refImageUrl as { error: string }).error}`
            : ''
          const failureNote = `Ref image failed at ${new Date().toISOString()}${errMsg}`
          const updatedNotes = existing?.adminNotes ? `${existing.adminNotes}\n${failureNote}` : failureNote
          await db.update(techniqueVariants)
            .set({ adminNotes: updatedNotes, updatedAt: new Date() })
            .where(eq(techniqueVariants.id, variantId.id))
        })
      }
    }

    return {
      variantId: variantId.id,
      name: object.name,
      eventId: object.event_id,
      positionId: object.position_id,
      sourceQuality: object.source_quality,
      status: variantId.status,
    }
  }
)
