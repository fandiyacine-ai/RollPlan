import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { techniqueVariants, aiCallLogs } from '../lib/db/schema'
import { google, GEMINI_VIDEO_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { TechniqueExtractionOutputSchema } from '../lib/ai/schemas/technique-extraction'
import { buildExtractTechniqueSystemPrompt, buildExtractTechniqueUserPrompt, EXTRACT_TECHNIQUE_PROMPT_VERSION } from '../lib/ai/prompts/extract-technique'
import { embedText } from '../lib/ai/embeddings'

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
