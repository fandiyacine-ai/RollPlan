import { generateObject } from 'ai'
import { NonRetriableError } from 'inngest'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, matches, positionSegments, matchEvents, insights, aiCallLogs } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { google, anthropic, GEMINI_VIDEO_MODEL, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { UrlScanOutputSchema, FoundMatch } from '../lib/ai/schemas/url-scan'
import { MatchExtractionOutputSchema } from '../lib/ai/schemas/match-extraction'
import { InsightsOutputSchema } from '../lib/ai/schemas/insights'
import { buildScanUrlSystemPrompt, buildScanUrlUserPrompt, SCAN_URL_PROMPT_VERSION } from '../lib/ai/prompts/scan-url'
import { buildExtractMatchSystemPrompt, buildExtractMatchUserPrompt, EXTRACT_MATCH_PROMPT_VERSION } from '../lib/ai/prompts/extract-match'
import { buildGenerateInsightsSystemPrompt, GENERATE_INSIGHTS_PROMPT_VERSION } from '../lib/ai/prompts/generate-insights'

export const scanUrl = inngest.createFunction(
  {
    id: 'scan-url',
    name: 'Scan URL for Matches',
    triggers: [{ event: 'url/submitted' }],
  },
  async ({ event, step }: {
    event: { data: { videoId: string; athleteName: string; format: string; sourceType: string; eventName?: string } }
    step: any
  }) => {
    const { videoId, athleteName, format, sourceType, eventName } = event.data

    const foundMatches: FoundMatch[] = await step.run('scan-for-matches', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')

      await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))

      const start = Date.now()
      let scanResult: { matches: FoundMatch[]; athlete_found: boolean; scan_notes: string }

      try {
        const { object, usage } = await generateObject({
          model: google(GEMINI_VIDEO_MODEL),
          schema: UrlScanOutputSchema,
          maxRetries: 0,
          system: buildScanUrlSystemPrompt(),
          messages: [{
            role: 'user',
            content: [
              { type: 'file', data: new URL(video.publicUrl), mediaType: 'video/mp4' },
              { type: 'text', text: buildScanUrlUserPrompt(athleteName) },
            ],
          }],
        })
        scanResult = object

        await db.insert(aiCallLogs).values({
          jobId: videoId,
          model: GEMINI_VIDEO_MODEL,
          promptVersion: SCAN_URL_PROMPT_VERSION,
          tokensIn: usage.inputTokens ?? 0,
          tokensOut: usage.outputTokens ?? 0,
          costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
          latencyMs: Date.now() - start,
          status: 'success',
        })
      } catch (err: unknown) {
        await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, videoId))
        throw err
      }

      if (!scanResult.athlete_found || scanResult.matches.length === 0) {
        await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, videoId))
        throw new NonRetriableError(
          `Athlete "${athleteName}" was not found in this video. Check the name matches what's shown on screen.`
        )
      }

      return scanResult.matches
    })

    for (let i = 0; i < foundMatches.length; i++) {
      const found = foundMatches[i]

      await step.run(`analyse-match-${i}`, async () => {
        const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
        if (!video?.publicUrl) throw new Error('Video has no public URL')

        const [match] = await db.insert(matches).values({
          videoId,
          userId: null,
          competitorLabel: athleteName,
          opponentLabel: found.opponent_name || 'unknown',
          format: format as 'gi' | 'no_gi',
          context: sourceType === 'own_sparring' ? 'sparring' : 'competition',
          ruleset: 'ibjjf',
          eventName: eventName ?? null,
          userNotes: found.round_or_bracket ?? null,
          status: 'processing',
        }).returning()

        // Extract positions + events
        const extractStart = Date.now()
        let extractObject: Awaited<ReturnType<typeof generateObject<typeof MatchExtractionOutputSchema>>>['object']
        let extractUsage: Awaited<ReturnType<typeof generateObject<typeof MatchExtractionOutputSchema>>>['usage']

        try {
          const result = await generateObject({
            model: google(GEMINI_VIDEO_MODEL),
            schema: MatchExtractionOutputSchema,
            maxRetries: 0,
            system: buildExtractMatchSystemPrompt(),
            messages: [{
              role: 'user',
              content: [
                { type: 'file', data: new URL(video.publicUrl), mediaType: 'video/mp4' },
                {
                  type: 'text',
                  text: buildExtractMatchUserPrompt({
                    competitorDescription: athleteName,
                    format: format as 'gi' | 'no_gi',
                    ruleset: 'ibjjf',
                    timestampRange: { startSeconds: found.start_seconds, endSeconds: found.end_seconds },
                  }),
                },
              ],
            }],
          })
          extractObject = result.object
          extractUsage = result.usage
        } catch (err) {
          await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, match.id))
          throw err
        }

        if (extractObject.positions.length === 0) {
          await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, match.id))
          return { matchId: match.id, status: 'failed' }
        }

        await db.transaction(async (tx) => {
          await tx.insert(positionSegments).values(
            extractObject.positions.map((p) => ({
              matchId: match.id,
              startSeconds: p.start_seconds,
              endSeconds: p.end_seconds,
              positionId: p.position_id,
              userRole: p.user_role,
              dominance: p.dominance,
              confidence: p.confidence,
            }))
          )
          if (extractObject.events.length > 0) {
            await tx.insert(matchEvents).values(
              extractObject.events.map((e) => ({
                matchId: match.id,
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
          jobId: match.id,
          model: GEMINI_VIDEO_MODEL,
          promptVersion: EXTRACT_MATCH_PROMPT_VERSION,
          tokensIn: extractUsage.inputTokens ?? 0,
          tokensOut: extractUsage.outputTokens ?? 0,
          costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, extractUsage.inputTokens ?? 0, extractUsage.outputTokens ?? 0),
          latencyMs: Date.now() - extractStart,
          status: 'success',
        })

        // Generate insights
        const segments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, match.id) })
        const events = await db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, match.id) })

        const matchData = {
          segments: segments.map((s) => ({
            id: s.id, start_seconds: s.startSeconds, end_seconds: s.endSeconds,
            position_id: s.positionId, user_role: s.userRole, dominance: s.dominance, confidence: s.confidence,
          })),
          events: events.map((e) => ({
            id: e.id, timestamp_seconds: e.timestampSeconds, event_type_id: e.eventTypeId,
            actor: e.actor, outcome: e.outcome, technique_label: e.techniqueLabel, confidence: e.confidence,
          })),
        }

        const insightStart = Date.now()
        try {
          const { object: insightObj, usage: insightUsage } = await generateObject({
            model: anthropic(CLAUDE_SYNTHESIS_MODEL),
            schema: InsightsOutputSchema,
            maxRetries: 0,
            system: buildGenerateInsightsSystemPrompt(),
            prompt: JSON.stringify(matchData),
          })

          await db.insert(insights).values(
            insightObj.insights.map((insight) => ({
              matchId: match.id,
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
            jobId: match.id,
            model: CLAUDE_SYNTHESIS_MODEL,
            promptVersion: GENERATE_INSIGHTS_PROMPT_VERSION,
            tokensIn: insightUsage.inputTokens ?? 0,
            tokensOut: insightUsage.outputTokens ?? 0,
            costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, insightUsage.inputTokens ?? 0, insightUsage.outputTokens ?? 0),
            latencyMs: Date.now() - insightStart,
            status: 'success',
          })
        } catch (err) {
          await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, match.id))
          throw err
        }

        await db.update(matches).set({ status: 'analysed' }).where(eq(matches.id, match.id))
        return { matchId: match.id, status: 'analysed' }
      })
    }

    await step.run('mark-video-analysed', async () => {
      await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, videoId))
    })
  }
)
