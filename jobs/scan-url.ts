import { generateObject } from 'ai'
import { NonRetriableError, RetryAfterError } from 'inngest'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, matches, positionSegments, matchEvents, insights, aiCallLogs, tournamentOpponents } from '../lib/db/schema'
import { eq, inArray, and, ne, not } from 'drizzle-orm'
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

function parseYouTubeTimestamp(url: string): number {
  try {
    const t = new URL(url).searchParams.get('t')
    if (!t) return 0
    const s = parseInt(t)
    return isNaN(s) ? 0 : s
  } catch { return 0 }
}

export const scanUrl = inngest.createFunction(
  {
    id: 'scan-url',
    name: 'Scan URL for Matches',
    retries: 10,
    triggers: [{ event: 'url/submitted' }],
  },
  async ({ event, step }: {
    event: { data: { videoId: string; userId?: string; athleteName: string; format: string; sourceType: string; eventName?: string; appearanceHint?: string; athleteImageBase64?: string; tournamentOpponentId?: string; skipScan?: boolean; startSeconds?: number; endSeconds?: number; chunkIndex?: number; chunkTotal?: number; chunkVideoIds?: string[]; matchesFoundSoFar?: number; consecutiveEmptyChunks?: number } }
    step: any
  }) => {
    const { videoId, userId, athleteName, format, sourceType, eventName, appearanceHint, athleteImageBase64, tournamentOpponentId, skipScan, startSeconds, endSeconds, chunkIndex, chunkTotal, chunkVideoIds, matchesFoundSoFar, consecutiveEmptyChunks } = event.data

    const CHUNK_SECS = 20 * 60  // 20-minute windows — ~60 frames at 0.05fps
    const NUM_CHUNKS = 20       // covers up to 6h40m (handles full competition day streams)

    // null return value signals "needs chunking" — handled after the step
    const scanStepResult: FoundMatch[] | null = skipScan
      ? [{ start_seconds: 0, end_seconds: 999999, opponent_name: 'unknown', round_or_bracket: null }]
      : await step.run('scan-for-matches', async (): Promise<FoundMatch[] | null> => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')

      await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))

      // YouTube full-video passes go straight to chunked scanning — no initial sparse scan.
      // A 0.05fps sweep of a 3h stream is too thin to reliably find all matches; it often
      // catches only 1 of N (or a scoreboard animation), then extracts wrong footage and
      // misses the rest entirely. Chunked 0.1fps 20-min windows are the reliable path.
      if (isYouTubeUrl(video.publicUrl) && chunkIndex === undefined) {
        return null
      }

      const start = Date.now()
      let scanResult: { matches: FoundMatch[]; athlete_found: boolean; scan_notes: string }

      try {
        let scanUsage: { inputTokens: number; outputTokens: number }

        if (isYouTubeUrl(video.publicUrl)) {
          const result = await geminiVideoObject(GEMINI_URL_SCAN_MODEL, {
            system: buildScanUrlSystemPrompt(),
            videoUrl: video.publicUrl,
            videoOptions: {
              fps: 0.1,
              ...(startSeconds !== undefined ? { startSeconds } : {}),
              ...(endSeconds !== undefined ? { endSeconds } : {}),
            },
            userPrompt: buildScanUrlUserPrompt(athleteName, appearanceHint),
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
                { type: 'text', text: buildScanUrlUserPrompt(athleteName, appearanceHint) },
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
        const msg = err instanceof Error ? err.message : String(err)
        const isYT = isYouTubeUrl(video.publicUrl)

        const failAndThrow = async (reason: string) => {
          await db.update(videos).set({ status: 'failed', failureReason: reason }).where(eq(videos.id, videoId))
          // For chunk jobs, also mark the parent video failed so it doesn't stay stuck in 'processing'
          if (chunkIndex !== undefined) {
            const chunkVid = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
            const parentId = chunkVid?.r2Key.split('/')[1]
            if (parentId) await db.update(videos).set({ status: 'failed', failureReason: reason }).where(eq(videos.id, parentId))
          }
          throw new NonRetriableError(reason)
        }

        if (msg.includes('invalid argument') || msg.includes('INVALID_ARGUMENT')) {
          await failAndThrow('This video could not be processed — it may be private, age-restricted, or the URL is no longer available.')
        }
        if (msg.includes('10800') || msg.includes('fewer than') || msg.includes('images in your request')) {
          await failAndThrow('Stream is too long — try a shorter clip or a direct mat recording instead of the full event stream.')
        }
        if (msg.includes('Resource has been exhausted') || msg.includes('RESOURCE_EXHAUSTED')) {
          if (isYT) {
            if (chunkIndex !== undefined) {
              throw new RetryAfterError('Gemini quota temporarily exhausted in chunk — retrying.', '5m')
            }
            await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))
            return null
          }
          await failAndThrow('Video is too large to process — keep direct video files under ~1 hour. For full tournament streams use the YouTube URL instead.')
        }
        if (msg.includes('input token count exceeds') || msg.includes('maximum number of tokens allowed')) {
          if (isYT && chunkIndex === undefined) {
            await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))
            return null
          }
          await failAndThrow(
            isYT
              ? 'Video chunk exceeded token limit — the stream segment may be unusually dense. Try a shorter clip.'
              : 'Video is too long for a single analysis pass — submit as a YouTube URL or split into ~1-hour segments.'
          )
        }
        await db.update(videos).set({ status: 'failed', failureReason: msg }).where(eq(videos.id, videoId))
        // For chunk jobs, mark parent failed so it doesn't stay stuck in 'processing'
        if (chunkIndex !== undefined) {
          const chunkVid = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
          const parentId = chunkVid?.r2Key.split('/')[1]
          if (parentId) await db.update(videos).set({ status: 'failed', failureReason: msg }).where(eq(videos.id, parentId))
        }
        throw err
      }

      if (!scanResult.athlete_found || scanResult.matches.length === 0) {
        if (chunkIndex !== undefined) {
          // Empty chunk — fine, mark done and let the chain continue to the next chunk
          await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, videoId))
          return []
        }
        if (isYouTubeUrl(video.publicUrl)) {
          // Full scan at sparse fps missed the athlete — retry with chunked 0.1fps scan before giving up
          await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))
          return null  // triggers chunking
        }
        const reason = `"${athleteName}" was not found in this video. Check the name matches exactly what's shown on screen.`
        await db.update(videos).set({ status: 'failed', failureReason: reason }).where(eq(videos.id, videoId))
        throw new NonRetriableError(reason)
      }

      return scanResult.matches
    })

    // ── Chunking: video was too long for a single Gemini pass ─────────────────
    if (scanStepResult === null) {
      const { chunkVideoIds: newChunkIds, urlOffset } = await step.run('create-chunk-videos', async () => {
        const original = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
        if (!original) throw new Error('Original video not found')

        // Respect YouTube &t= timestamp so chunks start from where the user pointed, not second 0
        const ytOffset = parseYouTubeTimestamp(original.publicUrl ?? '')

        const ids: string[] = []
        for (let i = 0; i < NUM_CHUNKS; i++) {
          const [v] = await db.insert(videos).values({
            userId: original.userId,
            r2Key: `chunk/${videoId}/${i}`,
            originalFilename: `${original.originalFilename} · Part ${i + 1}/${NUM_CHUNKS}`,
            contentType: original.contentType,
            sizeBytes: 0,
            sourceType: original.sourceType,
            publicUrl: original.publicUrl,
            status: 'uploaded',
            tournamentOpponentId: original.tournamentOpponentId ?? null,
          }).returning()
          ids.push(v.id)
        }

        // Keep parent as 'processing' while chunks scan — finalize-chunk-results will resolve it
        return { chunkVideoIds: ids, urlOffset: ytOffset }
      })

      // Fire only chunk 0 — each chunk triggers the next on completion (sequential, not parallel)
      await step.sendEvent('send-first-chunk', {
        name: 'url/submitted' as const,
        data: {
          videoId: newChunkIds[0],
          userId,
          athleteName,
          format,
          sourceType,
          eventName,
          appearanceHint,
          athleteImageBase64,
          tournamentOpponentId,
          startSeconds: urlOffset,
          endSeconds: urlOffset + CHUNK_SECS,
          chunkIndex: 0,
          chunkTotal: NUM_CHUNKS,
          chunkVideoIds: newChunkIds,
        },
      })

      return
    }

    const foundMatches: FoundMatch[] = scanStepResult

    for (let i = 0; i < foundMatches.length; i++) {
      const found = { ...foundMatches[i] }

      // Validate match window duration. If the scan returned a window shorter than 90s
      // (and it's not a walkover), the model likely grabbed a scoreboard overlay moment
      // instead of the actual match. Extend end_seconds to cover at least 8 minutes so
      // the extraction sees the real footage.
      if (!found.is_walkover) {
        const windowSecs = found.end_seconds - found.start_seconds
        if (windowSecs < 90) {
          found.end_seconds = found.start_seconds + 8 * 60
        }
      }

      // Step A: create match record in its own memoised step — if extraction is retried,
      // Inngest replays this step's result without re-inserting, preventing ghost match records.
      const matchId = await step.run(`create-match-${i}`, async () => {
        // Deduplication safety net: if a non-failed match already exists for this
        // opponent + opponent label, return its ID rather than creating a duplicate.
        if (tournamentOpponentId) {
          const existing = await db.query.matches.findFirst({
            where: (m, { and, eq, ne }) => and(
              eq(m.tournamentOpponentId, tournamentOpponentId),
              eq(m.opponentLabel, found.opponent_name || 'unknown'),
              ne(m.status, 'failed'),
            ),
          })
          if (existing) return existing.id
        }

        const result = found.match_result
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
          // Walkovers are complete immediately — no extraction needed
          status: found.is_walkover ? 'analysed' : 'processing',
          resultWinner: result ? (result.winner_is_tracked_athlete ? 'user' : 'opponent') : null,
          resultMethod: result?.method ?? null,
          resultTechnique: result?.technique ?? null,
        }).returning()
        return match.id
      })

      // Walkovers: no grappling occurred, skip extraction entirely
      if (found.is_walkover) continue

      // Step B: extract + analyse — idempotency guards mean retries safely skip already-done work
      await step.run(`extract-match-${i}`, async () => {
        const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
        if (!video?.publicUrl) throw new Error('Video has no public URL')

        // Idempotency: skip extraction if positions were already saved on a prior attempt
        const existingSegments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) })

        let extractedResult: MatchExtractionOutput['match_result'] | undefined

        if (existingSegments.length === 0) {
          // Extract positions + events
          const extractStart = Date.now()
          const isYT = isYouTubeUrl(video.publicUrl)
          let extractObject: MatchExtractionOutput
          let extractUsage: { inputTokens: number; outputTokens: number }

          try {
            if (isYT) {
              // Trim the YouTube video to just this match window. Gemini reports timestamps
              // relative to the clip start, so we shift back to absolute after.
              // For chunk jobs, startSeconds is the chunk's offset into the video —
              // found.start/end_seconds are relative to the chunk start, so we add the offset
              // to get the absolute position in the full video.
              const chunkOffset = startSeconds ?? 0
              const clipStart = skipScan ? 0 : (chunkOffset + found.start_seconds)
              const clipEnd = skipScan ? undefined : (chunkOffset + found.end_seconds)
              const matchDuration = found.end_seconds - found.start_seconds
              const videoOptions = skipScan
                ? { fps: 1.0 }
                : { fps: 1.0, startSeconds: clipStart, endSeconds: clipEnd }
              const result = await geminiVideoObject(GEMINI_URL_SCAN_MODEL, {
                system: buildExtractMatchSystemPrompt(),
                videoUrl: video.publicUrl,
                videoOptions,
                userPrompt: buildExtractMatchUserPrompt({
                  competitorDescription: athleteName,
                  appearanceHint: appearanceHint || undefined,
                  format: format as 'gi' | 'no_gi',
                  ruleset: 'ibjjf',
                  timestampRange: skipScan ? undefined : { startSeconds: 0, endSeconds: matchDuration },
                }),
                schema: MatchExtractionOutputSchema,
                referenceImageBase64: athleteImageBase64 || undefined,
              })
              // Only shift timestamps if we trimmed the clip (not when skipScan)
              extractObject = skipScan ? result.object : {
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
            const msg = err instanceof Error ? err.message : String(err)
            // Transient Gemini errors — leave status as 'processing' so UI doesn't flash 'failed'
            // during a retry, and use RetryAfterError so we don't hammer the API immediately.
            if (
              msg.includes('high demand') ||
              msg.includes('Internal error encountered') ||
              msg.includes('503') ||
              msg.includes('500') ||
              msg.includes('overloaded') ||
              msg.includes('UNAVAILABLE')
            ) {
              throw new RetryAfterError('Gemini temporarily unavailable during extraction — retrying.', '3m')
            }
            await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, matchId))
            throw err
          }

          extractedResult = extractObject.match_result

          if (extractObject.positions.length === 0) {
            await db.update(matches).set({
              status: 'analysed',
              resultMethod: extractedResult?.method ?? 'walkover',
              resultWinner: extractedResult?.winner ?? null,
              resultTechnique: extractedResult?.technique ?? null,
            }).where(eq(matches.id, matchId))
            return { matchId, status: 'analysed' }
          }

          await db.transaction(async (tx) => {
            await tx.insert(positionSegments).values(
              extractObject.positions.map((p) => ({
                matchId,
                startSeconds: p.start_seconds,
                endSeconds: p.end_seconds,
                positionId: p.position_id,
                userRole: p.user_role,
                dominance: p.dominance,
                confidence: p.confidence,
                userBbox: p.user_bbox ?? null,
                opponentBbox: p.opponent_bbox ?? null,
              }))
            )
            if (extractObject.events.length > 0) {
              await tx.insert(matchEvents).values(
                extractObject.events.map((e) => ({
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
            const allSegments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) })
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
                jobId: matchId,
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
        }

        // Generate insights — idempotency: skip if already generated on a prior attempt
        const existingInsights = await db.query.insights.findMany({ where: eq(insights.matchId, matchId) })

        if (existingInsights.length === 0) {
          const segments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) })
          const events = await db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, matchId) })

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
              tokensIn: insightUsage.inputTokens ?? 0,
              tokensOut: insightUsage.outputTokens ?? 0,
              costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, insightUsage.inputTokens ?? 0, insightUsage.outputTokens ?? 0),
              latencyMs: Date.now() - insightStart,
              status: 'success',
            })
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (msg.includes('overloaded') || msg.includes('529') || msg.includes('high demand')) {
              throw new RetryAfterError('Claude temporarily unavailable during insights — retrying.', '3m')
            }
            await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, matchId))
            throw err
          }
        }

        await db.update(matches).set({
          status: 'analysed',
          ...(extractedResult ? {
            resultWinner: extractedResult.winner,
            resultMethod: extractedResult.method,
            resultTechnique: extractedResult.technique ?? null,
          } : {}),
        }).where(eq(matches.id, matchId))
        return { matchId, status: 'analysed' }
      })
    }

    await step.run('mark-video-analysed', async () => {
      await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, videoId))
    })

    // Transition auto_queued → auto_ready once all opponent videos have finished scanning
    if (tournamentOpponentId && chunkIndex === undefined) {
      await step.run('check-opponent-ready', async () => {
        const opponentVideos = await db.query.videos.findMany({
          where: eq(videos.tournamentOpponentId, tournamentOpponentId),
        })
        const allSettled = opponentVideos.every(v => v.status === 'analysed' || v.status === 'failed')
        const anyAnalysed = opponentVideos.some(v => v.status === 'analysed')
        if (allSettled && anyAnalysed) {
          await db
            .update(tournamentOpponents)
            .set({ footageStatus: 'auto_ready' })
            .where(and(
              eq(tournamentOpponents.id, tournamentOpponentId),
              eq(tournamentOpponents.footageStatus, 'auto_queued'),
            ))
        }
      })
    }

    // Track progress across the chunk chain so we can stop early.
    const thisChunkMatchCount = foundMatches.length
    const newMatchesFoundSoFar = (matchesFoundSoFar ?? 0) + thisChunkMatchCount
    const newConsecutiveEmpty = thisChunkMatchCount > 0 ? 0 : (consecutiveEmptyChunks ?? 0) + 1
    // Stop scanning once we've found at least one match and seen 3 empty chunks in a row —
    // the athlete's block of matches is behind us and further scanning is wasteful.
    const shouldStopEarly = newConsecutiveEmpty >= 3 && newMatchesFoundSoFar > 0

    // Finalize: runs on the last chunk OR when we stop early.
    // If no matches were found across the entire batch, mark the parent video as failed.
    const isLastChunk = chunkIndex !== undefined && chunkTotal !== undefined && chunkIndex === chunkTotal - 1
    if ((isLastChunk || shouldStopEarly) && chunkVideoIds) {
      await step.run('finalize-chunk-results', async () => {
        const found = await db.select({ id: matches.id }).from(matches).where(inArray(matches.videoId, chunkVideoIds))
        // Chunk r2Keys are 'chunk/{parentVideoId}/{index}' — extract parent ID
        const chunkVideo = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
        const parentId = chunkVideo?.r2Key.split('/')[1]
        if (!parentId) return
        if (found.length === 0) {
          const reason = `"${athleteName}" was not found in this video. Check the name matches exactly what's shown on screen.`
          await db.update(videos).set({ status: 'failed', failureReason: reason }).where(eq(videos.id, parentId))
        } else {
          await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, parentId))
        }
      })
    }

    // Sequential chunk chain: trigger the next chunk only after this one is fully done.
    // Skip if we hit the natural end or the early-stop condition.
    if (chunkIndex !== undefined && chunkTotal !== undefined && chunkVideoIds && chunkIndex < chunkTotal - 1 && !shouldStopEarly) {
      const nextIndex = chunkIndex + 1
      // Brief cooldown so Gemini's per-minute quota has time to reset between chunks
      await step.sleep('chunk-cooldown', '30s')
      await step.sendEvent('send-next-chunk', {
        name: 'url/submitted' as const,
        data: {
          videoId: chunkVideoIds[nextIndex],
          userId,
          athleteName,
          format,
          sourceType,
          eventName,
          appearanceHint,
          athleteImageBase64,
          tournamentOpponentId,
          startSeconds: endSeconds,           // current chunk end = next chunk start
          endSeconds: endSeconds! + CHUNK_SECS,
          chunkIndex: nextIndex,
          chunkTotal,
          chunkVideoIds,
          matchesFoundSoFar: newMatchesFoundSoFar,
          consecutiveEmptyChunks: newConsecutiveEmpty,
        },
      })
    }
  }
)
