import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { techniqueVariants, aiCallLogs } from '../lib/db/schema'
import { google, GEMINI_VIDEO_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { TechniqueExtractionOutputSchema } from '../lib/ai/schemas/technique-extraction'
import { buildExtractTechniqueSystemPrompt, buildExtractTechniqueUserPrompt, EXTRACT_TECHNIQUE_PROMPT_VERSION } from '../lib/ai/prompts/extract-technique'

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
      }
    }
    step: any
  }) => {
    const { youtubeUrl, techniqueHint, positionHint, requestedByUserId } = event.data

    const { object, usage } = await step.run('extract-technique-gemini', async () => {
      const start = Date.now()

      // Gemini can process YouTube URLs directly — no upload needed
      const result = await generateObject({
        model: google(GEMINI_VIDEO_MODEL),
        schema: TechniqueExtractionOutputSchema,
        maxRetries: 0,
        system: buildExtractTechniqueSystemPrompt(),
        messages: [{
          role: 'user',
          content: [
            {
              type: 'file',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: new URL(youtubeUrl) as any,
              mediaType: 'video/mp4',
            },
            {
              type: 'text',
              text: buildExtractTechniqueUserPrompt({ techniqueHint, positionHint }),
            },
          ],
        }],
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

      const [record] = await db.insert(techniqueVariants).values({
        eventId: object.event_id,
        positionId: object.position_id ?? null,
        name: object.name,
        format: object.format,
        visualCues: object.visual_cues,
        counters: object.counters ?? null,
        sourceUrl: youtubeUrl,
        sourceLabel: techniqueHint ?? object.name,
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
