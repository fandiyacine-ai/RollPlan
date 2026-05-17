import { generateObject } from 'ai'
import { NonRetriableError } from 'inngest'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, matches, positionSegments, matchEvents, insights, aiCallLogs } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { google, anthropic, GEMINI_VIDEO_MODEL, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { uploadVideoToGemini, deleteGeminiFile } from '../lib/ai/gemini-files'
import { MatchExtractionOutputSchema } from '../lib/ai/schemas/match-extraction'
import { PositionVerificationSchema } from '../lib/ai/schemas/position-verification'
import { InsightsOutputSchema } from '../lib/ai/schemas/insights'
import { buildExtractMatchSystemPrompt, buildExtractMatchUserPrompt, EXTRACT_MATCH_PROMPT_VERSION } from '../lib/ai/prompts/extract-match'
import { buildVerifyPositionsSystemPrompt, buildVerifyPositionsUserPrompt, VERIFY_POSITIONS_PROMPT_VERSION } from '../lib/ai/prompts/verify-positions'
import { buildGenerateInsightsSystemPrompt, GENERATE_INSIGHTS_PROMPT_VERSION } from '../lib/ai/prompts/generate-insights'

const CONFUSION_PRONE = new Set([
  'closed_guard', 'back_control', 'mount', 'side_control',
  'turtle', 'north_south', 'half_guard', 'butterfly_guard', 'knee_on_belly',
])

async function markFailed(matchId: string, videoId: string) {
  await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, matchId))
  await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, videoId))
}

export const analyzeVideo = inngest.createFunction(
  {
    id: 'analyze-video',
    name: 'Analyse Match Video',
    triggers: [{ event: 'video/uploaded' }],
  },
  async ({ event, step }: { event: { data: { videoId: string; matchId: string; appearanceHint?: string; athleteImageBase64?: string } }; step: any }) => {
    const { videoId, matchId, appearanceHint, athleteImageBase64 } = event.data

    await step.run('validate-video', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video) throw new Error(`Video ${videoId} not found`)
      if (video.durationSeconds && video.durationSeconds > 900) {
        await markFailed(matchId, videoId)
        throw new NonRetriableError('Video exceeds 15-minute limit. Please upload a single match clip.')
      }
    })

    await step.run('generate-thumbnail', async () => {
      return { thumbnailKey: null }
    })

    // Upload video to Gemini Files API — streams from R2 to disk to Google,
    // never loading the full file into Node.js heap
    const { geminiFileUri } = await step.run('upload-to-gemini', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')
      const geminiFileUri = await uploadVideoToGemini(video.publicUrl, video.contentType)
      return { geminiFileUri }
    })

    await step.run('extract-positions-events', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')

      const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
      if (!match) throw new Error(`Match ${matchId} not found`)

      await db.update(matches).set({ status: 'processing' }).where(eq(matches.id, matchId))
      await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))

      let object: Awaited<ReturnType<typeof generateObject<typeof MatchExtractionOutputSchema>>>['object']
      let usage: Awaited<ReturnType<typeof generateObject<typeof MatchExtractionOutputSchema>>>['usage']

      const start = Date.now()
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extractContent: any[] = []
        if (athleteImageBase64) {
          extractContent.push({ type: 'image', image: `data:image/jpeg;base64,${athleteImageBase64}` })
          extractContent.push({ type: 'text', text: '↑ This is the competitor to track — study their appearance carefully before analysing the video.' })
        }
        extractContent.push({ type: 'file', data: new URL(geminiFileUri), mediaType: video.contentType as `${string}/${string}` })
        extractContent.push({
          type: 'text',
          text: buildExtractMatchUserPrompt({
            competitorDescription: match.competitorLabel ?? 'the main competitor',
            appearanceHint: appearanceHint || undefined,
            format: match.format,
            ruleset: match.ruleset,
            durationSeconds: video.durationSeconds ?? undefined,
          }),
        })

        const result = await generateObject({
          model: google(GEMINI_VIDEO_MODEL),
          schema: MatchExtractionOutputSchema,
          maxRetries: 0,
          system: buildExtractMatchSystemPrompt(),
          messages: [{ role: 'user', content: extractContent }],
        })
        object = result.object
        usage = result.usage
      } catch (err: unknown) {
        await markFailed(matchId, videoId)
        const msg = err instanceof Error ? err.message : String(err)
        // Schema validation failure means Gemini couldn't find a BJJ match in the video
        if (msg.includes('did not match schema') || msg.includes('too_small')) {
          throw new NonRetriableError('Video does not appear to contain a BJJ match. Please upload match footage.')
        }
        throw err
      }

      if (object.positions.length === 0) {
        await markFailed(matchId, videoId)
        throw new NonRetriableError('Video does not appear to contain a BJJ match. Please upload match footage.')
      }

      await db.transaction(async (tx) => {
        await tx.insert(positionSegments).values(
          object.positions.map((p) => ({
            matchId,
            startSeconds: p.start_seconds,
            endSeconds: p.end_seconds,
            positionId: p.position_id,
            userRole: p.user_role,
            dominance: p.dominance,
            confidence: p.confidence,
          }))
        )
        if (object.events.length > 0) {
          await tx.insert(matchEvents).values(
            object.events.map((e) => ({
              matchId,
              timestampSeconds: e.timestamp_seconds,
              eventTypeId: e.event_type_id,
              actor: e.actor,
              outcome: e.outcome,
              techniqueLabel: e.technique_label ?? null,
              confidence: e.confidence,
            }))
          )
        }
      })

      await db.insert(aiCallLogs).values({
        jobId: matchId,
        model: GEMINI_VIDEO_MODEL,
        promptVersion: EXTRACT_MATCH_PROMPT_VERSION,
        tokensIn: usage.inputTokens ?? 0,
        tokensOut: usage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
        latencyMs: Date.now() - start,
        status: 'success',
      })

      return { segmentCount: object.positions.length, eventCount: object.events.length }
    })

    await step.run('verify-positions', async () => {
      const allSegments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) })
      const toVerify = allSegments.filter(s => s.confidence < 0.75 || CONFUSION_PRONE.has(s.positionId))
      if (toVerify.length === 0) return { corrections: 0 }

      const start = Date.now()
      let verifyObject: Awaited<ReturnType<typeof generateObject<typeof PositionVerificationSchema>>>['object']
      let verifyUsage: Awaited<ReturnType<typeof generateObject<typeof PositionVerificationSchema>>>['usage']

      try {
        const result = await generateObject({
          model: google(GEMINI_VIDEO_MODEL),
          schema: PositionVerificationSchema,
          maxRetries: 0,
          system: buildVerifyPositionsSystemPrompt(),
          messages: [{
            role: 'user',
            content: [
              { type: 'file', data: new URL(geminiFileUri), mediaType: 'video/mp4' },
              { type: 'text', text: buildVerifyPositionsUserPrompt(
                toVerify.map((s, i) => ({
                  index: i,
                  positionId: s.positionId,
                  userRole: s.userRole,
                  dominance: s.dominance,
                  startSeconds: s.startSeconds,
                  endSeconds: s.endSeconds,
                  confidence: s.confidence,
                }))
              )},
            ],
          }],
        })
        verifyObject = result.object
        verifyUsage = result.usage
      } catch {
        // Verification is best-effort — don't fail the job
        return { corrections: 0, error: 'verification_failed' }
      }

      let corrections = 0
      for (const review of verifyObject.reviews) {
        if (!review.confirmed && review.corrected_position_id && review.confidence >= 0.8) {
          const seg = toVerify[review.segment_index]
          if (!seg) continue
          await db.update(positionSegments).set({
            positionId: review.corrected_position_id,
            ...(review.corrected_dominance ? { dominance: review.corrected_dominance } : {}),
            confidence: review.confidence,
          }).where(eq(positionSegments.id, seg.id))
          corrections++
        }
      }

      await db.insert(aiCallLogs).values({
        jobId: matchId,
        model: GEMINI_VIDEO_MODEL,
        promptVersion: VERIFY_POSITIONS_PROMPT_VERSION,
        tokensIn: verifyUsage.inputTokens ?? 0,
        tokensOut: verifyUsage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, verifyUsage.inputTokens ?? 0, verifyUsage.outputTokens ?? 0),
        latencyMs: Date.now() - start,
        status: 'success',
      })

      return { corrections, reviewed: toVerify.length }
    })

    await step.run('generate-insights', async () => {
      const segments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) })
      const events = await db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, matchId) })

      const matchData = {
        segments: segments.map((s) => ({
          id: s.id,
          start_seconds: s.startSeconds,
          end_seconds: s.endSeconds,
          position_id: s.positionId,
          user_role: s.userRole,
          dominance: s.dominance,
          confidence: s.confidence,
        })),
        events: events.map((e) => ({
          id: e.id,
          timestamp_seconds: e.timestampSeconds,
          event_type_id: e.eventTypeId,
          actor: e.actor,
          outcome: e.outcome,
          technique_label: e.techniqueLabel,
          confidence: e.confidence,
        })),
      }

      const start = Date.now()
      let insightResult: Awaited<ReturnType<typeof generateObject<typeof InsightsOutputSchema>>>

      try {
        insightResult = await generateObject({
          model: anthropic(CLAUDE_SYNTHESIS_MODEL),
          schema: InsightsOutputSchema,
          maxRetries: 0,
          system: buildGenerateInsightsSystemPrompt(),
          prompt: JSON.stringify(matchData),
        })
      } catch (err: unknown) {
        await markFailed(matchId, videoId)
        throw err
      }

      const { object, usage } = insightResult

      await db.insert(insights).values(
        object.insights.map((insight) => ({
          matchId,
          category: insight.category,
          severity: insight.severity,
          description: insight.description,
          suggestion: insight.suggestion,
          conceptTags: insight.concept_tags,
          evidenceSegmentIds: insight.evidence_segment_ids,
          evidenceEventIds: insight.evidence_event_ids,
          confidence: insight.confidence,
          youtubeSearchQuery: insight.youtube_search_query ?? null,
          promptVersion: GENERATE_INSIGHTS_PROMPT_VERSION,
        }))
      )

      await db.insert(aiCallLogs).values({
        jobId: matchId,
        model: CLAUDE_SYNTHESIS_MODEL,
        promptVersion: GENERATE_INSIGHTS_PROMPT_VERSION,
        tokensIn: usage.inputTokens ?? 0,
        tokensOut: usage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
        latencyMs: Date.now() - start,
        status: 'success',
      })

      return { insightCount: object.insights.length }
    })

    await step.run('mark-analysed', async () => {
      await db.update(matches).set({ status: 'analysed' }).where(eq(matches.id, matchId))
      await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, videoId))
    })

    await step.run('cleanup-gemini-file', async () => {
      await deleteGeminiFile(geminiFileUri)
    })
  }
)
