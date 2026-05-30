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
import { buildReviewEventsSystemPrompt, buildReviewEventsUserPrompt, REVIEW_EVENTS_PROMPT_VERSION } from '../lib/ai/prompts/review-events'
import { buildScanSubmissionsSystemPrompt, buildScanSubmissionsUserPrompt, SCAN_SUBMISSIONS_PROMPT_VERSION } from '../lib/ai/prompts/scan-submissions'
import { EventReviewOutputSchema } from '../lib/ai/schemas/event-review'
import { SubmissionScanOutputSchema } from '../lib/ai/schemas/submission-scan'
import { getTechniqueVariantsForExtraction, getTechniqueVariantsForPositions, formatVariantsAsPromptBlock } from '../lib/ai/technique-retrieval'
import { isYouTubeUrl, geminiVideoObject } from '../lib/gemini-video'

const CONFUSION_PRONE = new Set([
  'closed_guard', 'back_control', 'mount', 'side_control',
  'turtle', 'north_south', 'half_guard', 'butterfly_guard', 'knee_on_belly',
])

// Positions where submission attempts are frequent enough to scan unconditionally —
// even when Claude's statistical review didn't flag a specific anomaly.
// minWindowSeconds: minimum consolidated window length that triggers a scan.
const PROACTIVE_SCAN_CONFIG: Record<string, { minWindowSeconds: number; attacks: string[] }> = {
  back_control:    { minWindowSeconds: 5, attacks: ['rear_naked_choke', 'triangle', 'choke_other'] },
  mount:           { minWindowSeconds: 5, attacks: ['armbar', 'triangle', 'choke_other', 'ezekiel_choke'] },
  closed_guard:    { minWindowSeconds: 5, attacks: ['triangle', 'armbar', 'kimura', 'omoplata', 'guillotine'] },
  half_guard:      { minWindowSeconds: 5, attacks: ['kimura', 'darce', 'heel_hook'] },
  butterfly_guard: { minWindowSeconds: 5, attacks: ['guillotine', 'armbar'] },
  inside_sankaku:  { minWindowSeconds: 5, attacks: ['heel_hook', 'kneebar'] },
  fifty_fifty:     { minWindowSeconds: 5, attacks: ['heel_hook', 'toe_hold'] },
  ashi_garami:     { minWindowSeconds: 5, attacks: ['heel_hook', 'toe_hold'] },
  single_leg_x:    { minWindowSeconds: 5, attacks: ['heel_hook', 'kneebar'] },
  k_guard:         { minWindowSeconds: 5, attacks: ['heel_hook'] },
  north_south:     { minWindowSeconds: 5, attacks: ['north_south_choke', 'kimura', 'triangle'] },
  turtle:          { minWindowSeconds: 5, attacks: ['rear_naked_choke', 'clock_choke', 'darce'] },
  crucifix:        { minWindowSeconds: 5, attacks: ['armbar', 'twister', 'choke_other'] },
  side_control:    { minWindowSeconds: 8, attacks: ['kimura', 'choke_other', 'paper_cutter_choke'] },
}

// Full set of submission event IDs for coverage checks
const SUBMISSION_EVENT_IDS = new Set([
  'armbar', 'kimura', 'omoplata', 'wrist_lock', 'bicep_slicer', 'joint_lock_other',
  'triangle', 'rear_naked_choke', 'guillotine', 'darce', 'anaconda_choke',
  'north_south_choke', 'ezekiel_choke', 'von_flue_choke', 'twister',
  'baseball_bat_choke', 'clock_choke', 'paper_cutter_choke', 'choke_other',
  'heel_hook', 'kneebar', 'toe_hold', 'calf_slicer', 'leg_lock_other',
])

type PositionSeg = { positionId: string; startSeconds: number; endSeconds: number }
type ScanWindow  = { start_seconds: number; end_seconds: number; reason: string; likely_event_types: string[] }

// Merge consecutive segments of the same position into a single window.
// Gaps <= GAP_TOLERANCE seconds are bridged (brief scrambles/transitions between the same position).
function consolidatePositionWindows(segments: PositionSeg[], positionId: string, minSeconds: number): ScanWindow[] {
  const GAP_TOLERANCE = 3
  const matching = segments.filter(s => s.positionId === positionId).sort((a, b) => a.startSeconds - b.startSeconds)
  if (matching.length === 0) return []

  const windows: ScanWindow[] = []
  let winStart = matching[0].startSeconds
  let winEnd   = matching[0].endSeconds
  const cfg = PROACTIVE_SCAN_CONFIG[positionId]!

  for (let i = 1; i < matching.length; i++) {
    const seg = matching[i]
    if (seg.startSeconds - winEnd <= GAP_TOLERANCE) {
      winEnd = Math.max(winEnd, seg.endSeconds)
    } else {
      if (winEnd - winStart >= minSeconds) {
        windows.push({ start_seconds: winStart, end_seconds: winEnd, reason: `Proactive: ${positionId} held ${Math.round(winEnd - winStart)}s — checking for ${cfg.attacks.join(', ')}`, likely_event_types: cfg.attacks })
      }
      winStart = seg.startSeconds
      winEnd   = seg.endSeconds
    }
  }
  if (winEnd - winStart >= minSeconds) {
    windows.push({ start_seconds: winStart, end_seconds: winEnd, reason: `Proactive: ${positionId} held ${Math.round(winEnd - winStart)}s — checking for ${cfg.attacks.join(', ')}`, likely_event_types: cfg.attacks })
  }
  return windows
}

// True if >50% of window A is covered by window B — used to deduplicate proactive vs Claude windows.
function windowCoveredBy(a: { start_seconds: number; end_seconds: number }, b: { start_seconds: number; end_seconds: number }): boolean {
  const overlap = Math.max(0, Math.min(a.end_seconds, b.end_seconds) - Math.max(a.start_seconds, b.start_seconds))
  const len = a.end_seconds - a.start_seconds
  return len > 0 && overlap / len > 0.5
}

async function markFailed(matchId: string, videoId: string) {
  await db.update(matches).set({ status: 'failed' }).where(eq(matches.id, matchId))
  await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, videoId))
}

export const analyzeVideo = inngest.createFunction(
  {
    id: 'analyze-video',
    name: 'Analyse Match Video',
    triggers: [{ event: 'video/uploaded' }],
    // Cap simultaneous Gemini calls — Railway Pro has 24 GB RAM; 4 concurrent jobs fit safely
    concurrency: { limit: 4 },
  },
  async ({ event, step }: { event: { data: { videoId: string; matchId: string; appearanceHint?: string; athleteImageBase64?: string } }; step: any }) => {
    const { videoId, matchId, appearanceHint, athleteImageBase64 } = event.data

    await step.run('validate-video', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video) throw new Error(`Video ${videoId} not found`)
      // Skip duration check for YouTube URLs — they're full tournament streams and will
      // be bounded to the match window via startOffset/endOffset in later steps.
      if (!isYouTubeUrl(video.publicUrl ?? '') && video.durationSeconds && video.durationSeconds > 900) {
        await markFailed(matchId, videoId)
        throw new NonRetriableError('Video exceeds 15-minute limit. Please upload a single match clip.')
      }
    })

    await step.run('generate-thumbnail', async () => {
      return { thumbnailKey: null }
    })

    // Upload video to Gemini Files API (R2 videos) or pass YouTube URL directly.
    // YouTube URLs work natively with Gemini — no upload or cleanup needed.
    // Also capture match time bounds so we can clip long tournament streams.
    const { geminiFileUri, isYouTube, videoStartSeconds, videoEndSeconds } = await step.run('upload-to-gemini', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')
      if (isYouTubeUrl(video.publicUrl)) {
        const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
        return {
          geminiFileUri: video.publicUrl,
          isYouTube: true,
          videoStartSeconds: match?.matchStartSeconds ?? null,
          videoEndSeconds: match?.matchEndSeconds ?? null,
        }
      }
      let geminiFileUri: string
      try {
        geminiFileUri = await uploadVideoToGemini(video.publicUrl, video.contentType)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('file processing failed') || msg.includes('Gemini file processing')) {
          await markFailed(matchId, videoId)
          throw new NonRetriableError('This video could not be processed — the file may be in an unsupported format or was rejected by the AI provider. Try a different video source.')
        }
        throw err
      }
      return { geminiFileUri, isYouTube: false, videoStartSeconds: null, videoEndSeconds: null }
    })

    const { matchUserId } = await step.run('extract-positions-events', async () => {
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      if (!video?.publicUrl) throw new Error('Video has no public URL')

      const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
      if (!match) throw new Error(`Match ${matchId} not found`)

      await db.update(matches).set({ status: 'processing' }).where(eq(matches.id, matchId))
      await db.update(videos).set({ status: 'processing' }).where(eq(videos.id, videoId))

      let object: Awaited<ReturnType<typeof generateObject<typeof MatchExtractionOutputSchema>>>['object']
      let usage: { inputTokens: number; outputTokens: number }

      // Fetch general technique variants (positionId IS NULL) — format-filtered, cap 15
      const techniqueVariants = await getTechniqueVariantsForExtraction(match.format)
      const techniquePromptBlock = formatVariantsAsPromptBlock(techniqueVariants)

      const start = Date.now()
      try {
        if (isYouTube) {
          // YouTube streams can be hours long — pass time bounds so Gemini only
          // processes the match window (set by the smoothcomp scanner on original ingest).
          // Gemini returns timestamps relative to startOffset (0-based), so we add
          // videoStartSeconds back when storing to get absolute stream positions.
          const matchDurationSeconds =
            videoStartSeconds != null && videoEndSeconds != null
              ? videoEndSeconds - videoStartSeconds
              : undefined
          const result = await geminiVideoObject(GEMINI_VIDEO_MODEL, {
            system: buildExtractMatchSystemPrompt(techniquePromptBlock),
            videoUrl: geminiFileUri,
            videoOptions: {
              resolution: 'MEDIUM' as const,
              thinkingEffort: 'HIGH' as const,
              startSeconds: videoStartSeconds ?? undefined,
              endSeconds: videoEndSeconds ?? undefined,
            },
            userPrompt: buildExtractMatchUserPrompt({
              competitorDescription: match.competitorLabel ?? 'the main competitor',
              appearanceHint: appearanceHint || undefined,
              format: match.format,
              ruleset: match.ruleset,
              durationSeconds: matchDurationSeconds,
            }),
            schema: MatchExtractionOutputSchema,
            referenceImageBase64: athleteImageBase64 || undefined,
          })
          object = result.object
          usage = result.usage
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const extractContent: any[] = []

          // Technique reference images — visual anchors for submission detection
          for (const variant of techniqueVariants) {
            if (variant.referenceImageUrl) {
              extractContent.push({ type: 'image', image: variant.referenceImageUrl })
              extractContent.push({ type: 'text', text: `↑ TECHNIQUE REFERENCE: ${variant.name}. ${variant.visualCues.slice(0, 200)}` })
            }
          }

          if (athleteImageBase64) {
            extractContent.push({ type: 'image', image: `data:image/jpeg;base64,${athleteImageBase64}` })
            extractContent.push({ type: 'text', text: '↑ IDENTITY REFERENCE FRAME. The red "⬅ YOU" box marks the ONLY athlete to label as "user" for the ENTIRE match. The other athlete is ALWAYS "opponent". Use this annotated frame as your identity anchor — do not swap these roles at any point.' })
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extractContent.push({ type: 'file', data: new URL(geminiFileUri) as any, mediaType: video.contentType as `${string}/${string}` })
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
            system: buildExtractMatchSystemPrompt(techniquePromptBlock),
            messages: [{ role: 'user', content: extractContent }],
          })
          object = result.object
          usage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
        }
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

      // Gemini returns timestamps relative to startOffset (0-based from clip start).
      // Add the stream offset so all stored timestamps are absolute within the video.
      const tsOffset = isYouTube ? (videoStartSeconds ?? 0) : 0

      await db.transaction(async (tx) => {
        await tx.insert(positionSegments).values(
          object.positions.map((p) => ({
            matchId,
            startSeconds: p.start_seconds + tsOffset,
            endSeconds: p.end_seconds + tsOffset,
            positionId: p.position_id,
            userRole: p.user_role,
            dominance: p.dominance,
            confidence: p.confidence,
            userBbox: p.user_bbox ?? null,
            opponentBbox: p.opponent_bbox ?? null,
          }))
        )
        if (object.events.length > 0) {
          await tx.insert(matchEvents).values(
            object.events.map((e) => ({
              matchId,
              timestampSeconds: e.timestamp_seconds + tsOffset,
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
        userId: match.userId ?? null,
        jobId: matchId,
        model: GEMINI_VIDEO_MODEL,
        promptVersion: EXTRACT_MATCH_PROMPT_VERSION,
        tokensIn: usage.inputTokens ?? 0,
        tokensOut: usage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
        latencyMs: Date.now() - start,
        status: 'success',
      })

      return { segmentCount: object.positions.length, eventCount: object.events.length, matchUserId: match.userId }
    })

    await step.run('verify-positions', async () => {
      const allSegments = await db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) })
      const toVerify = allSegments.filter(s => s.confidence < 0.75 || CONFUSION_PRONE.has(s.positionId))
      if (toVerify.length === 0) return { corrections: 0 }

      const start = Date.now()
      let verifyObject: Awaited<ReturnType<typeof generateObject<typeof PositionVerificationSchema>>>['object']
      let verifyUsage: { inputTokens: number; outputTokens: number }

      const verifyPrompt = buildVerifyPositionsUserPrompt(
        toVerify.map((s, i) => ({
          index: i,
          positionId: s.positionId,
          userRole: s.userRole,
          dominance: s.dominance,
          startSeconds: s.startSeconds,
          endSeconds: s.endSeconds,
          confidence: s.confidence,
        }))
      )

      try {
        if (isYouTube) {
          const result = await geminiVideoObject(GEMINI_VIDEO_MODEL, {
            system: buildVerifyPositionsSystemPrompt(),
            videoUrl: geminiFileUri,
            videoOptions: {
              resolution: 'MEDIUM' as const,
              thinkingEffort: 'HIGH' as const,
              startSeconds: videoStartSeconds ?? undefined,
              endSeconds: videoEndSeconds ?? undefined,
            },
            userPrompt: verifyPrompt,
            schema: PositionVerificationSchema,
          })
          verifyObject = result.object
          verifyUsage = result.usage
        } else {
          const result = await generateObject({
            model: google(GEMINI_VIDEO_MODEL),
            schema: PositionVerificationSchema,
            maxRetries: 0,
            system: buildVerifyPositionsSystemPrompt(),
            messages: [{
              role: 'user',
              content: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                { type: 'file', data: new URL(geminiFileUri) as any, mediaType: 'video/mp4' },
                { type: 'text', text: verifyPrompt },
              ],
            }],
          })
          verifyObject = result.object
          verifyUsage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
        }
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
        userId: matchUserId ?? null,
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

    // ── Level 2 review: Claude flags gaps + proactive position scan → Gemini re-scans ──
    await step.run('review-events-claude', async () => {
      const [allSegments, allEvents] = await Promise.all([
        db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) }),
        db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, matchId) }),
      ])

      // ── 1. Claude statistical review (best-effort — proactive scan runs regardless) ──
      const reviewStart = Date.now()
      let suspicious: Array<{ start_seconds: number; end_seconds: number; reason: string; likely_event_types: string[]; priority: 'high' | 'medium' }> = []
      try {
        const reviewResult = await generateObject({
          model: anthropic(CLAUDE_SYNTHESIS_MODEL),
          schema: EventReviewOutputSchema,
          maxRetries: 0,
          system: buildReviewEventsSystemPrompt(),
          prompt: buildReviewEventsUserPrompt({
            segments: allSegments.map(s => ({
              start_seconds: s.startSeconds,
              end_seconds: s.endSeconds,
              position_id: s.positionId,
              user_role: s.userRole,
              dominance: s.dominance,
            })),
            events: allEvents.map(e => ({
              timestamp_seconds: e.timestampSeconds,
              event_type_id: e.eventTypeId,
              actor: e.actor,
              outcome: e.outcome,
            })),
          }),
        })
        suspicious = reviewResult.object.suspicious_windows
        await db.insert(aiCallLogs).values({
          userId: matchUserId ?? null,
          jobId: matchId,
          model: CLAUDE_SYNTHESIS_MODEL,
          promptVersion: REVIEW_EVENTS_PROMPT_VERSION,
          tokensIn: reviewResult.usage.inputTokens ?? 0,
          tokensOut: reviewResult.usage.outputTokens ?? 0,
          costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, reviewResult.usage.inputTokens ?? 0, reviewResult.usage.outputTokens ?? 0),
          latencyMs: Date.now() - reviewStart,
          status: 'success',
        })
      } catch {
        // Claude review failed — proactive scan still runs below
      }

      // ── 2. Proactive windows: scan every high-attack position unconditionally ──
      // Skip windows that already have a submission event recorded inside them.
      const existingSubTimes = allEvents
        .filter(e => SUBMISSION_EVENT_IDS.has(e.eventTypeId))
        .map(e => e.timestampSeconds)

      const proactiveWindows: ScanWindow[] = []
      const segs: PositionSeg[] = allSegments.map(s => ({ positionId: s.positionId, startSeconds: s.startSeconds, endSeconds: s.endSeconds }))
      for (const [posId, cfg] of Object.entries(PROACTIVE_SCAN_CONFIG)) {
        for (const win of consolidatePositionWindows(segs, posId, cfg.minWindowSeconds)) {
          const alreadyCovered = existingSubTimes.some(t => t >= win.start_seconds && t <= win.end_seconds)
          if (!alreadyCovered) proactiveWindows.push(win)
        }
      }

      // ── 3. Merge Claude + proactive, deduplicate, cap at 8 windows ──────────
      // Order: Claude high-priority → proactive → Claude medium-priority
      const claudeHigh = suspicious.filter(w => w.priority === 'high')
      const claudeMed  = suspicious.filter(w => w.priority === 'medium')
      const allClaudeWindows = [...claudeHigh, ...claudeMed]
      const dedupedProactive = proactiveWindows.filter(pw => !allClaudeWindows.some(cw => windowCoveredBy(pw, cw)))
      const scanWindows = [...claudeHigh, ...dedupedProactive, ...claudeMed].slice(0, 8)

      if (scanWindows.length === 0) return { suspicious: suspicious.length, proactive: 0, scanned: 0, added: 0 }

      // ── 4. Fetch position-specific technique KB variants ──────────────────
      const positionIds = allSegments.map(s => s.positionId)
      const match2 = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
      const positionVariants = match2
        ? await getTechniqueVariantsForPositions(positionIds, match2.format)
        : []
      const positionTechniqueBlock = formatVariantsAsPromptBlock(positionVariants)

      // ── 5. Gemini targeted re-scan ─────────────────────────────────────────
      const video = await db.query.videos.findFirst({ where: eq(videos.id, videoId) })
      const scanStart = Date.now()
      let scanObject: Awaited<ReturnType<typeof geminiVideoObject<typeof SubmissionScanOutputSchema>>>['object']
      let scanUsage: { inputTokens: number; outputTokens: number }

      try {
        if (isYouTube) {
          const result = await geminiVideoObject(GEMINI_VIDEO_MODEL, {
            system: buildScanSubmissionsSystemPrompt(positionTechniqueBlock),
            videoUrl: geminiFileUri,
            videoOptions: {
              resolution: 'MEDIUM' as const,
              thinkingEffort: 'HIGH' as const,
              startSeconds: videoStartSeconds ?? undefined,
              endSeconds: videoEndSeconds ?? undefined,
            },
            userPrompt: buildScanSubmissionsUserPrompt(scanWindows),
            schema: SubmissionScanOutputSchema,
          })
          scanObject = result.object
          scanUsage = result.usage
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const scanContent: any[] = [
            { type: 'file', data: new URL(geminiFileUri) as any, mediaType: (video?.contentType ?? 'video/mp4') as `${string}/${string}` },
            { type: 'text', text: buildScanSubmissionsUserPrompt(scanWindows) },
          ]
          const result = await generateObject({
            model: google(GEMINI_VIDEO_MODEL),
            schema: SubmissionScanOutputSchema,
            maxRetries: 0,
            system: buildScanSubmissionsSystemPrompt(positionTechniqueBlock),
            messages: [{ role: 'user', content: scanContent }],
          })
          scanObject = result.object
          scanUsage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
        }
      } catch {
        return { suspicious: suspicious.length, proactive: dedupedProactive.length, scanned: 0, error: 'scan_failed' }
      }

      await db.insert(aiCallLogs).values({
        userId: matchUserId ?? null,
        jobId: matchId,
        model: GEMINI_VIDEO_MODEL,
        promptVersion: SCAN_SUBMISSIONS_PROMPT_VERSION,
        tokensIn: scanUsage.inputTokens ?? 0,
        tokensOut: scanUsage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, scanUsage.inputTokens ?? 0, scanUsage.outputTokens ?? 0),
        latencyMs: Date.now() - scanStart,
        status: 'success',
      })

      if (scanObject.events.length === 0) return { suspicious: suspicious.length, proactive: dedupedProactive.length, scanned: 0, added: 0 }

      // ── 6. Deduplicate against existing events (±10s same type = skip) ───
      const existingEvents = await db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, matchId) })
      const newEvents = scanObject.events.filter(ev =>
        ev.confidence >= 0.65 &&
        !existingEvents.some(ex =>
          ex.eventTypeId === ev.event_type_id &&
          Math.abs(ex.timestampSeconds - ev.timestamp_seconds) <= 10
        )
      )

      if (newEvents.length > 0) {
        const scanTsOffset = isYouTube ? (videoStartSeconds ?? 0) : 0
        await db.insert(matchEvents).values(
          newEvents.map(ev => ({
            matchId,
            timestampSeconds: ev.timestamp_seconds + scanTsOffset,
            eventTypeId: ev.event_type_id,
            actor: ev.actor,
            outcome: ev.outcome ?? 'ongoing',
            techniqueLabel: ev.technique_label ?? null,
            confidence: ev.confidence,
          }))
        )
      }

      return { suspicious: suspicious.length, proactive: dedupedProactive.length, scanned: scanObject.events.length, added: newEvents.length }
    })

    await step.run('generate-insights', async () => {
      const [matchRow, segments, events] = await Promise.all([
        db.query.matches.findFirst({ where: eq(matches.id, matchId) }),
        db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, matchId) }),
        db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, matchId) }),
      ])

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
          system: buildGenerateInsightsSystemPrompt(matchRow?.competitorLabel ?? 'athlete', matchRow?.opponentLabel ?? 'opponent', !!(matchRow?.tournamentOpponentId)),
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
        userId: matchUserId ?? null,
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
      if (!isYouTube) await deleteGeminiFile(geminiFileUri)
    })
  }
)
