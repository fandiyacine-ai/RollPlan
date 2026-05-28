import { generateObject } from 'ai'
import { NonRetriableError, RetryAfterError } from 'inngest'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { videos, matches, positionSegments, matchEvents, insights, aiCallLogs, tournamentOpponents } from '../lib/db/schema'
import { eq, inArray, and, ne, not, sql } from 'drizzle-orm'
import { google, anthropic, GEMINI_URL_SCAN_MODEL, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { geminiVideoObject, isYouTubeUrl } from '../lib/gemini-video'
import { UrlScanOutputSchema, FoundMatch } from '../lib/ai/schemas/url-scan'
import { MatchExtractionOutputSchema, type MatchExtractionOutput } from '../lib/ai/schemas/match-extraction'
import { PositionVerificationSchema } from '../lib/ai/schemas/position-verification'
import { InsightsOutputSchema } from '../lib/ai/schemas/insights'
import { buildScanUrlSystemPrompt, buildScanUrlUserPrompt, SCAN_URL_PROMPT_VERSION } from '../lib/ai/prompts/scan-url'
import { ocrScanYouTube } from '../lib/scan/frame-ocr'
import { createNotification } from '../lib/db/notifications'
import { buildExtractMatchSystemPrompt, buildExtractMatchUserPrompt, EXTRACT_MATCH_PROMPT_VERSION } from '../lib/ai/prompts/extract-match'
import { getTechniqueVariantsForExtraction, formatVariantsAsPromptBlock } from '../lib/ai/technique-retrieval'
import { buildVerifyPositionsSystemPrompt, buildVerifyPositionsUserPrompt, VERIFY_POSITIONS_PROMPT_VERSION } from '../lib/ai/prompts/verify-positions'
import { buildGenerateInsightsSystemPrompt, GENERATE_INSIGHTS_PROMPT_VERSION } from '../lib/ai/prompts/generate-insights'

// Gemini returns timestamps in MM.SS decimal format (e.g. 38.32 = 38 min 32 sec = 2312s).
// Used for both scan results and extraction segment timestamps.
function mmssToSecs(t: number): number {
  const m = Math.floor(t)
  const s = Math.round((t % 1) * 100)
  return m * 60 + s
}

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
    // Handle YouTube formats: "1570", "1570s", "26m10s", "1h4m", "1h4m0s"
    const h = t.match(/(\d+)h/)
    const m = t.match(/(\d+)m/)
    const s = t.match(/(\d+)s/)
    if (h || m || s) {
      return (parseInt(h?.[1] ?? '0') || 0) * 3600
           + (parseInt(m?.[1] ?? '0') || 0) * 60
           + (parseInt(s?.[1] ?? '0') || 0)
    }
    const n = parseInt(t)
    return isNaN(n) ? 0 : n
  } catch { return 0 }
}

export const scanUrl = inngest.createFunction(
  {
    id: 'scan-url',
    name: 'Scan URL for Matches',
    retries: 10,
    triggers: [{ event: 'url/submitted' }],
    // Cap simultaneous Gemini calls — prevents quota exhaustion when multiple videos scan in parallel
    concurrency: { limit: 8 },
  },
  async ({ event, step }: {
    event: { data: { videoId: string; userId?: string; athleteName: string; format: string; sourceType: string; eventName?: string; appearanceHint?: string; athleteImageBase64?: string; tournamentOpponentId?: string; skipScan?: boolean; startSeconds?: number; endSeconds?: number; chunkIndex?: number; chunkTotal?: number; chunkVideoIds?: string[]; matchesFoundSoFar?: number; consecutiveEmptyChunks?: number; ytTimestampHint?: number } }
    step: any
  }) => {
    const { videoId, userId, athleteName, format, sourceType, eventName, appearanceHint, athleteImageBase64, tournamentOpponentId, skipScan, startSeconds, endSeconds, chunkIndex, chunkTotal, chunkVideoIds, matchesFoundSoFar, consecutiveEmptyChunks, ytTimestampHint } = event.data

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
              resolution: 'LOW' as const,
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
          userId: userId ?? null,
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
        console.error('[scan-url] Gemini error (raw):', err)
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
              throw new RetryAfterError('Gemini quota temporarily exhausted in chunk — retrying.', '15m')
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
        if (msg.includes('file processing failed') || msg.includes('Gemini file processing')) {
          await failAndThrow('This video could not be processed — the file may be in an unsupported format or was rejected by the AI provider. Try a different video source.')
        }
        // Transient Gemini/network errors — don't mark as permanently failed, let Inngest retry
        if (
          err instanceof SyntaxError ||
          msg.includes('Unexpected end of JSON') ||
          msg.includes('Unexpected token') ||
          msg.includes('JSON input') ||
          msg.includes('Internal error encountered') ||
          msg.includes('high demand') ||
          msg.includes('overloaded') ||
          msg.includes('503') ||
          msg.includes('500') ||
          msg.includes('UNAVAILABLE')
        ) {
          if (chunkIndex !== undefined) {
            throw new RetryAfterError('Gemini transient error in chunk scan — retrying.', '10m')
          }
          // For non-chunk scans, leave video in 'processing' so UI shows scanning, not failed
          await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))
          throw new RetryAfterError('Gemini transient error during scan — retrying.', '10m')
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

        // Use the timestamp hint passed from the submission (extracted before URL normalization strips &t).
        // Fall back to parsing the stored URL for legacy events that pre-date this field.
        const ytOffset = (ytTimestampHint ?? 0) > 0
          ? ytTimestampHint!
          : parseYouTubeTimestamp(original.publicUrl ?? '')

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

      // Convert MM.SS → pure seconds before any further timestamp arithmetic
      if (!found.is_walkover && (found.end_seconds - found.start_seconds) < 60) {
        found.start_seconds = mmssToSecs(found.start_seconds)
        found.end_seconds = mmssToSecs(found.end_seconds)
        if (found.outcome_screen_seconds !== undefined) {
          found.outcome_screen_seconds = mmssToSecs(found.outcome_screen_seconds)
        }
      }

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
          // Scan timestamps are absolute from video origin — store directly, no chunk offset needed.
          matchStartSeconds: skipScan ? (startSeconds ?? 0) : Math.round(found.start_seconds),
          matchEndSeconds: skipScan ? (endSeconds ?? null) : Math.round(found.end_seconds),
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

          // Inject technique KB into the extraction prompt so Gemini can detect known patterns
          const kbVariants = await getTechniqueVariantsForExtraction(format as 'gi' | 'no_gi')
          const techniqueContext = formatVariantsAsPromptBlock(kbVariants)

          try {
            if (isYT) {
              // Trim the YouTube video to a padded window around this match. Gemini reports timestamps
              // Anchor the extraction clip to the OUTCOME SCREEN, not the match start.
              //
              // The outcome screen (winner announcement) is a static 30-60s event that Gemini
              // reliably detects at 0.1fps. The match START is a single frame that the sparse
              // scan routinely misses or confuses with a "next match" preview card.
              //
              // Strategy: clip = [outcome_screen - MAX_MATCH_DURATION, outcome_screen + 120s]
              // This guarantees the full match is in the clip regardless of how imprecise
              // start_seconds was. The extraction model is then told to anchor from the outcome
              // screen at the END of the clip and work backwards.
              const MAX_MATCH_DURATION = 8 * 60  // 8 min — covers most AJP/IBJJF matches while keeping frame count manageable
              const OUTCOME_TAIL = 120            // 2 min after outcome screen

              // Scan timestamps are absolute from video origin — use directly, no chunk offset needed.
              // Use outcome_screen_seconds as the primary anchor; fall back to end_seconds
              const outcomeAbsolute = skipScan
                ? (endSeconds ?? 999999)
                : (found.outcome_screen_seconds ?? found.end_seconds)

              const clipStart = Math.max(0, outcomeAbsolute - MAX_MATCH_DURATION)
              const clipEnd = skipScan ? (endSeconds ?? undefined) : outcomeAbsolute + OUTCOME_TAIL

              // Where in the clip the outcome screen is expected (for the extraction prompt hint)
              const outcomeOffsetInClip = outcomeAbsolute - clipStart

              const videoOptions = {
                fps: 0.5,
                resolution: 'LOW' as const,
                ...(clipStart > 0 ? { startSeconds: clipStart } : {}),
                ...(clipEnd !== undefined ? { endSeconds: clipEnd } : {}),
              }
              const result = await geminiVideoObject(GEMINI_URL_SCAN_MODEL, {
                system: buildExtractMatchSystemPrompt(techniqueContext),
                videoUrl: video.publicUrl,
                videoOptions,
                userPrompt: buildExtractMatchUserPrompt({
                  competitorDescription: athleteName,
                  opponentName: found.opponent_name || undefined,
                  appearanceHint: appearanceHint || undefined,
                  format: format as 'gi' | 'no_gi',
                  ruleset: 'ibjjf',
                  // Tell extraction where the outcome screen is — model works backwards from there
                  outcomeScreenSeconds: skipScan ? undefined : outcomeOffsetInClip,
                  userSide: found.user_side ?? undefined,
                }),
                schema: MatchExtractionOutputSchema,
                referenceImageBase64: athleteImageBase64 || undefined,
              })
              // Extraction timestamps are absolute from video origin — no shift needed.
              extractObject = result.object
              extractUsage = result.usage
            } else {
              const result = await generateObject({
                model: google(GEMINI_URL_SCAN_MODEL),
                schema: MatchExtractionOutputSchema,
                maxRetries: 0,
                system: buildExtractMatchSystemPrompt(techniqueContext),
                messages: [{
                  role: 'user',
                  content: [
                    videoFilePart(video.publicUrl, video.contentType),
                    {
                      type: 'text',
                      text: buildExtractMatchUserPrompt({
                        competitorDescription: athleteName,
                        opponentName: found.opponent_name || undefined,
                        appearanceHint: appearanceHint || undefined,
                        format: format as 'gi' | 'no_gi',
                        ruleset: 'ibjjf',
                        outcomeScreenSeconds: found.outcome_screen_seconds ?? found.end_seconds,
                        userSide: found.user_side ?? undefined,
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
            // Token limit in extraction — mark failed immediately (retrying won't help, clip is already as small as we can make it)
            if (msg.includes('input token count exceeds') || msg.includes('maximum number of tokens allowed')) {
              await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, matchId))
              throw new NonRetriableError('Extraction clip exceeded Gemini token limit — match skipped.')
            }
            // Transient errors — leave status as 'processing' so UI doesn't flash 'failed'
            // during a retry, and use RetryAfterError so we don't hammer the API immediately.
            if (
              msg.includes('high demand') ||
              msg.includes('Internal error encountered') ||
              msg.includes('503') ||
              msg.includes('500') ||
              msg.includes('overloaded') ||
              msg.includes('UNAVAILABLE') ||
              // Truncated/malformed JSON from Gemini — transient network issue, safe to retry
              err instanceof SyntaxError ||
              msg.includes('Unexpected end of JSON') ||
              msg.includes('Unexpected token') ||
              msg.includes('JSON input')
            ) {
              throw new RetryAfterError('Gemini returned an incomplete response — retrying.', '10m')
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

          // Extraction may also return timestamps in MM.SS decimal format.
          // Detect using the same span heuristic: if the total range of segment
          // timestamps is < 60 units, the unit is minutes not seconds.
          const posSpan = extractObject.positions.length > 0
            ? Math.max(...extractObject.positions.map(p => p.end_seconds))
              - Math.min(...extractObject.positions.map(p => p.start_seconds))
            : 999
          const extractNeedsMMSS = isYT && posSpan < 60
          const toSecs = extractNeedsMMSS ? mmssToSecs : (t: number) => t

          await db.transaction(async (tx) => {
            await tx.insert(positionSegments).values(
              extractObject.positions.map((p) => ({
                matchId,
                startSeconds: toSecs(p.start_seconds),
                endSeconds: toSecs(p.end_seconds),
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
                  timestampSeconds: toSecs(e.timestamp_seconds),
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
            userId: userId ?? null,
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
                userId: userId ?? null,
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
              system: buildGenerateInsightsSystemPrompt(athleteName, found.opponent_name || 'opponent', !!(tournamentOpponentId)),
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
              userId: userId ?? null,
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
            console.error('[scan-url] insights error (raw):', err)
            if (
              msg.includes('overloaded') ||
              msg.includes('529') ||
              msg.includes('high demand') ||
              msg.includes('Internal error') ||
              msg.includes('503') ||
              msg.includes('500') ||
              err instanceof SyntaxError ||
              msg.includes('Unexpected end of JSON') ||
              msg.includes('JSON input')
            ) {
              throw new RetryAfterError('Transient error during insights — retrying.', '10m')
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
      // Estimate duration from the furthest segment end across all matches for this video
      const [dur] = await db
        .select({ maxEnd: sql<number>`max(${positionSegments.endSeconds})` })
        .from(positionSegments)
        .innerJoin(matches, eq(matches.id, positionSegments.matchId))
        .where(eq(matches.videoId, videoId))
      await db.update(videos).set({
        status: 'analysed',
        ...(dur?.maxEnd ? { durationSeconds: Math.round(dur.maxEnd) } : {}),
      }).where(eq(videos.id, videoId))
    })

    // Notify user when their own non-chunked match analysis is done
    if (!tournamentOpponentId && userId && chunkIndex === undefined) {
      await step.run('notify-video-analysed', async () => {
        await createNotification(
          userId,
          'video_analysed',
          'Match analysis ready',
          `Your footage has been analysed and matches are ready to review.`,
          '/matches',
        )
      })
    }

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
          if (userId) {
            const opponent = await db.query.tournamentOpponents.findFirst({
              where: eq(tournamentOpponents.id, tournamentOpponentId),
            })
            if (opponent) {
              await createNotification(
                userId,
                'scout_ready',
                `Scouting ready — ${opponent.opponentLabel}`,
                'Footage analysis complete. View timeline and generate a gameplan.',
                `/tournaments/${opponent.tournamentId}/opponents`,
              )
            }
          }
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
          if (!tournamentOpponentId && userId) {
            await createNotification(
              userId,
              'video_analysed',
              'Match analysis ready',
              `${found.length} match${found.length > 1 ? 'es' : ''} found and ready to review.`,
              '/matches',
            )
          }
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
