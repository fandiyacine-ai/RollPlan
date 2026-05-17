import { generateObject } from 'ai'
import { NonRetriableError } from 'inngest'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, matches, positionSegments, matchEvents, insights, aiCallLogs } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { google, anthropic, GEMINI_URL_SCAN_MODEL, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { geminiVideoObject, isYouTubeUrl } from '../lib/gemini-video'
import { UrlScanOutputSchema, FoundMatch } from '../lib/ai/schemas/url-scan'
import { MatchExtractionOutputSchema, type MatchExtractionOutput } from '../lib/ai/schemas/match-extraction'
import { PositionVerificationSchema } from '../lib/ai/schemas/position-verification'
import { InsightsOutputSchema } from '../lib/ai/schemas/insights'
import { buildScanUrlSystemPrompt, buildScanUrlUserPrompt, SCAN_URL_PROMPT_VERSION } from '../lib/ai/prompts/scan-url'
import { buildExtractMatchSystemPrompt, buildExtractMatchUserPrompt, EXTRACT_MATCH_PROMPT_VERSION } from '../lib/ai/prompts/extract-match'
import { buildVerifyPositionsSystemPrompt, buildVerifyPositionsUserPrompt, VERIFY_POSITIONS_PROMPT_VERSION } from '../lib/ai/prompts/verify-positions'
import { buildGenerateInsightsSystemPrompt, GENERATE_INSIGHTS_PROMPT_VERSION } from '../lib/ai/prompts/generate-insights'

const CONFUSION_PRONE = new Set([
  'closed_guard', 'back_control', 'mount', 'side_control',
  'turtle', 'north_south', 'half_guard', 'butterfly_guard', 'knee_on_belly',
])

function videoFilePart(url: string, contentType = 'video/mp4') {
  return { type: 'file' as const, data: new URL(url), mediaType: contentType as `${string}/${string}` }
}

export const scanUrl = inngest.createFunction(
  {
    id: 'scan-url',
    name: 'Scan URL for Matches',
    triggers: [{ event: 'url/submitted' }],
  },
  async ({ event, step }: {
    event: { data: { videoId: string; userId?: string; athleteName: string; format: string; sourceType: string; eventName?: string; appearanceHint?: string; tournamentOpponentId?: string } }
    step: any
  }) => {
    const { videoId, userId, athleteName, format, sourceType, eventName, appearanceHint, tournamentOpponentId } = event.data

    const foundMatches: FoundMatch[] = await step.run('scan-for-matches', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')

      await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))

      const start = Date.now()
      let scanResult: { matches: FoundMatch[]; athlete_found: boolean; scan_notes: string }

      try {
        let scanUsage: { inputTokens: number; outputTokens: number }

        if (isYouTubeUrl(video.publicUrl)) {
          // Full competition streams can be 2–4+ hours. Scan at 0.1fps (1 frame/10s) to stay
          // well under Gemini's 1M token limit while still catching scoreboard transitions.
          const result = await geminiVideoObject(GEMINI_URL_SCAN_MODEL, {
            system: buildScanUrlSystemPrompt(),
            videoUrl: video.publicUrl,
            videoOptions: { fps: 0.1 },
            userPrompt: buildScanUrlUserPrompt(athleteName),
            schema: UrlScanOutputSchema,
          })
          scanResult = result.object
          scanUsage = result.usage
        } else {
          const result = await generateObject({
            model: google(GEMINI_URL_SCAN_MODEL),
            schema: UrlScanOutputSchema,
            maxRetries: 0,
            system: buildScanUrlSystemPrompt(),
            messages: [{
              role: 'user',
              content: [
                videoFilePart(video.publicUrl, video.contentType),
                { type: 'text', text: buildScanUrlUserPrompt(athleteName) },
              ],
            }],
          })
          scanResult = result.object
          scanUsage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
        }

        await db.insert(aiCallLogs).values({
          jobId: videoId,
          model: GEMINI_URL_SCAN_MODEL,
          promptVersion: SCAN_URL_PROMPT_VERSION,
          tokensIn: scanUsage.inputTokens,
          tokensOut: scanUsage.outputTokens,
          costUsdEstimate: estimateCostUsd(GEMINI_URL_SCAN_MODEL, scanUsage.inputTokens, scanUsage.outputTokens),
          latencyMs: Date.now() - start,
          status: 'success',
        })
      } catch (err: unknown) {
        await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, videoId))
        const msg = err instanceof Error ? err.message : String(err)
        const isYT = isYouTubeUrl(video.publicUrl)
        if (msg.includes('10800') || msg.includes('fewer than') || msg.includes('images in your request')) {
          throw new NonRetriableError('Stream is too long — try a shorter clip or a direct mat recording instead of the full event stream.')
        }
        if (msg.includes('Resource has been exhausted') || msg.includes('RESOURCE_EXHAUSTED')) {
          throw new NonRetriableError(
            isYT
              ? 'Gemini quota exhausted processing this YouTube video — the stream may be extremely long (6h+) or the API quota is temporarily exceeded. Try again in a few minutes, or submit a shorter clip.'
              : 'Video is too large to process — keep direct video files under ~1 hour. For full tournament streams use the YouTube URL instead.'
          )
        }
        if (msg.includes('input token count exceeds') || msg.includes('maximum number of tokens allowed')) {
          throw new NonRetriableError(
            isYT
              ? 'YouTube video exceeded token limit even at low fps — this stream may be over 6 hours. Try submitting the individual mat recording URL instead of the full event stream.'
              : 'Video is too long for a single analysis pass — submit as a YouTube URL or split into ~1-hour segments.'
          )
        }
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
          userId: userId ?? null,
          competitorLabel: athleteName,
          opponentLabel: found.opponent_name || 'unknown',
          format: format as 'gi' | 'no_gi',
          context: sourceType === 'own_sparring' ? 'sparring' : 'competition',
          ruleset: 'ibjjf',
          eventName: eventName ?? null,
          userNotes: found.round_or_bracket ?? null,
          tournamentOpponentId: tournamentOpponentId ?? null,
          status: 'processing',
        }).returning()

        // Extract positions + events
        const extractStart = Date.now()
        const isYT = isYouTubeUrl(video.publicUrl)
        let extractObject: MatchExtractionOutput
        let extractUsage: { inputTokens: number; outputTokens: number }

        try {
          if (isYT) {
            // Trim the YouTube video to just this match window. Gemini reports timestamps
            // relative to the clip start, so we shift them back to absolute after.
            const clipStart = found.start_seconds
            const result = await geminiVideoObject(GEMINI_URL_SCAN_MODEL, {
              system: buildExtractMatchSystemPrompt(),
              videoUrl: video.publicUrl,
              videoOptions: { fps: 1.0, startSeconds: clipStart, endSeconds: found.end_seconds },
              userPrompt: buildExtractMatchUserPrompt({
                competitorDescription: athleteName,
                appearanceHint: appearanceHint || undefined,
                format: format as 'gi' | 'no_gi',
                ruleset: 'ibjjf',
                timestampRange: { startSeconds: 0, endSeconds: found.end_seconds - clipStart },
              }),
              schema: MatchExtractionOutputSchema,
            })
            extractObject = {
              ...result.object,
              positions: result.object.positions.map(p => ({
                ...p,
                start_seconds: p.start_seconds + clipStart,
                end_seconds: p.end_seconds + clipStart,
              })),
              events: result.object.events.map(e => ({
                ...e,
                timestamp_seconds: e.timestamp_seconds + clipStart,
              })),
            }
            extractUsage = result.usage
          } else {
            const result = await generateObject({
              model: google(GEMINI_URL_SCAN_MODEL),
              schema: MatchExtractionOutputSchema,
              maxRetries: 0,
              system: buildExtractMatchSystemPrompt(),
              messages: [{
                role: 'user',
                content: [
                  videoFilePart(video.publicUrl, video.contentType),
                  {
                    type: 'text',
                    text: buildExtractMatchUserPrompt({
                      competitorDescription: athleteName,
                      appearanceHint: appearanceHint || undefined,
                      format: format as 'gi' | 'no_gi',
                      ruleset: 'ibjjf',
                      timestampRange: { startSeconds: found.start_seconds, endSeconds: found.end_seconds },
                    }),
                  },
                ],
              }],
            })
            extractObject = result.object
            extractUsage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
          }
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
          model: GEMINI_URL_SCAN_MODEL,
          promptVersion: EXTRACT_MATCH_PROMPT_VERSION,
          tokensIn: extractUsage.inputTokens ?? 0,
          tokensOut: extractUsage.outputTokens ?? 0,
          costUsdEstimate: estimateCostUsd(GEMINI_URL_SCAN_MODEL, extractUsage.inputTokens ?? 0, extractUsage.outputTokens ?? 0),
          latencyMs: Date.now() - extractStart,
          status: 'success',
        })

        // Verify positions — targeted second pass on confusion-prone / low-confidence segments.
        // Skip for YouTube: extraction already runs at 1fps on the trimmed match window.
        if (!isYT) try {
          const allSegments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, match.id) })
          const toVerify = allSegments.filter(s => s.confidence < 0.75 || CONFUSION_PRONE.has(s.positionId))

          if (toVerify.length > 0) {
            const verifyStart = Date.now()
            const { object: verifyObject, usage: verifyUsage } = await generateObject({
              model: google(GEMINI_URL_SCAN_MODEL),
              schema: PositionVerificationSchema,
              maxRetries: 0,
              system: buildVerifyPositionsSystemPrompt(),
              messages: [{
                role: 'user',
                content: [
                  videoFilePart(video.publicUrl, video.contentType),
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

            for (const review of verifyObject.reviews) {
              if (!review.confirmed && review.corrected_position_id && review.confidence >= 0.8) {
                const seg = toVerify[review.segment_index]
                if (!seg) continue
                await db.update(positionSegments).set({
                  positionId: review.corrected_position_id,
                  ...(review.corrected_dominance ? { dominance: review.corrected_dominance } : {}),
                  confidence: review.confidence,
                }).where(eq(positionSegments.id, seg.id))
              }
            }

            await db.insert(aiCallLogs).values({
              jobId: match.id,
              model: GEMINI_URL_SCAN_MODEL,
              promptVersion: VERIFY_POSITIONS_PROMPT_VERSION,
              tokensIn: verifyUsage.inputTokens ?? 0,
              tokensOut: verifyUsage.outputTokens ?? 0,
              costUsdEstimate: estimateCostUsd(GEMINI_URL_SCAN_MODEL, verifyUsage.inputTokens ?? 0, verifyUsage.outputTokens ?? 0),
              latencyMs: Date.now() - verifyStart,
              status: 'success',
            })
          }
        } catch {
          // Verification is best-effort — don't fail the match
        }

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
