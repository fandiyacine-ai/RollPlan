/**
 * Rescan Matches After KB Upgrade
 *
 * Triggered when the KB agent completes a run and new technique variants
 * become active. For each YouTube-based analysed match whose positions
 * overlap with newly activated variants, we re-run the Claude event review
 * + Gemini targeted scan. Any newly detected events are added to the match
 * and the user is notified in a single batched message.
 *
 * Only YouTube (Smoothcomp) videos are eligible — R2-uploaded clips are
 * deleted from Gemini after analysis and cannot be re-scanned without a
 * full re-upload.
 */

import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { matches, videos, positionSegments, matchEvents, aiCallLogs } from '../lib/db/schema'
import { eq, and, gte, inArray, sql, asc } from 'drizzle-orm'
import { anthropic, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { GEMINI_VIDEO_MODEL } from '../lib/ai/clients'
import { isYouTubeUrl, geminiVideoObject } from '../lib/gemini-video'
import { buildReviewEventsSystemPrompt, buildReviewEventsUserPrompt, REVIEW_EVENTS_PROMPT_VERSION } from '../lib/ai/prompts/review-events'
import { buildScanSubmissionsSystemPrompt, buildScanSubmissionsUserPrompt, SCAN_SUBMISSIONS_PROMPT_VERSION } from '../lib/ai/prompts/scan-submissions'
import { EventReviewOutputSchema } from '../lib/ai/schemas/event-review'
import { SubmissionScanOutputSchema } from '../lib/ai/schemas/submission-scan'
import { getTechniqueVariantsForPositions, formatVariantsAsPromptBlock } from '../lib/ai/technique-retrieval'
import { techniqueVariants } from '../lib/db/schema'
import { createNotification } from '../lib/db/notifications'

export const rescanMatchesWithKb = inngest.createFunction(
  {
    id: 'rescan-matches-kb',
    name: 'Rescan Matches After KB Upgrade',
    triggers: [{ event: 'technique/kb-upgraded' }],
    concurrency: { limit: 1 },
  },
  async ({ event, step }: { event: { data: { startedAt: string; videosQueued: number } }; step: any }) => {
    const { startedAt } = event.data

    // Allow all ingest-technique jobs triggered by the KB agent to complete.
    // Each ingestion runs Gemini (up to ~5 min). With up to 60 queued and
    // Inngest parallelism, 3h is a safe upper bound.
    await step.sleep('wait-for-ingest', '3h')

    // Find variants that became active since the KB run started
    const newVariants: Array<{ id: string; eventId: string; positionId: string | null; name: string }> =
      await step.run('find-new-variants', async () => {
        return db.query.techniqueVariants.findMany({
          where: and(
            eq(techniqueVariants.status, 'active'),
            gte(techniqueVariants.createdAt, new Date(startedAt))
          ),
          columns: { id: true, eventId: true, positionId: true, name: true },
        })
      })

    if (newVariants.length === 0) return { upgraded: 0, reason: 'no new variants activated' }

    // Collect the unique position IDs covered by new variants (null = all positions)
    const newPositionIds = [...new Set(newVariants.map(v => v.positionId).filter((id): id is string => id !== null))]
    const hasGeneralVariants = newVariants.some(v => v.positionId === null)

    // Find analysed YouTube matches that have segments in any of those positions
    const affectedMatches = await step.run('find-affected-matches', async () => {
      // Join matches with videos to filter by YouTube publicUrl
      const rows = await db
        .select({
          id: matches.id,
          userId: matches.userId,
          videoId: matches.videoId,
          matchStartSeconds: matches.matchStartSeconds,
          matchEndSeconds: matches.matchEndSeconds,
          opponentLabel: matches.opponentLabel,
          kbChangelog: matches.kbChangelog,
          kbVersion: matches.kbVersion,
          videoPublicUrl: videos.publicUrl,
        })
        .from(matches)
        .innerJoin(videos, eq(matches.videoId, videos.id))
        .where(eq(matches.status, 'analysed'))

      const ytMatches = rows.filter(m => m.videoPublicUrl && isYouTubeUrl(m.videoPublicUrl))

      if (ytMatches.length === 0) return []

      const ytMatchIds = ytMatches.map(m => m.id)

      // Find which of those have relevant segments
      let relevantMatchIds: string[]
      if (hasGeneralVariants) {
        // General variants apply to all positions — every YouTube match is affected
        relevantMatchIds = ytMatchIds
      } else {
        const relevantSegments = await db.query.positionSegments.findMany({
          where: and(
            inArray(positionSegments.matchId, ytMatchIds),
            inArray(positionSegments.positionId, newPositionIds)
          ),
          columns: { matchId: true },
        })
        relevantMatchIds = [...new Set(relevantSegments.map(s => s.matchId))]
      }

      return ytMatches.filter(m => relevantMatchIds.includes(m.id))
    })

    if (affectedMatches.length === 0) return { upgraded: 0, reason: 'no YouTube matches with relevant positions' }

    // Rescan each affected match
    const upgradeResults: Array<{ matchId: string; userId: string | null; opponentLabel: string; added: number }> = []

    for (const match of affectedMatches as any[]) {
      const result = await step.run(`rescan-${match.id}`, async () => {
        const [allSegments, allEvents] = await Promise.all([
          db.query.positionSegments.findMany({ where: eq(positionSegments.matchId, match.id) }),
          db.query.matchEvents.findMany({ where: eq(matchEvents.matchId, match.id) }),
        ])

        // Claude flags suspicious windows in the existing analysis
        let suspicious: any[] = []
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

          await db.insert(aiCallLogs).values({
            userId: match.userId ?? null,
            jobId: match.id,
            model: CLAUDE_SYNTHESIS_MODEL,
            promptVersion: REVIEW_EVENTS_PROMPT_VERSION,
            tokensIn: reviewResult.usage.inputTokens ?? 0,
            tokensOut: reviewResult.usage.outputTokens ?? 0,
            costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, reviewResult.usage.inputTokens ?? 0, reviewResult.usage.outputTokens ?? 0),
            latencyMs: 0,
            status: 'success',
          })

          suspicious = reviewResult.object.suspicious_windows ?? []
        } catch {
          // If Claude review fails, fall back to scanning position-matched segments
          suspicious = allSegments
            .filter(s => hasGeneralVariants || newPositionIds.includes(s.positionId))
            .map(s => ({
              start_seconds: s.startSeconds,
              end_seconds: s.endSeconds,
              reason: 'KB position match',
              priority: 'medium',
            }))
        }

        if (suspicious.length === 0) return { added: 0 }

        const topWindows = suspicious
          .sort((a: any, b: any) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1))
          .slice(0, 3)

        // Fetch updated technique variants for positions in this match
        const positionIds = allSegments.map(s => s.positionId)
        const positionVariants = await getTechniqueVariantsForPositions(positionIds, 'no_gi')
        const techniqueBlock = formatVariantsAsPromptBlock(positionVariants)

        // Gemini targeted scan with updated KB
        const tsOffset = match.matchStartSeconds ?? 0
        let scanObject: any
        try {
          const scanResult = await geminiVideoObject(GEMINI_VIDEO_MODEL, {
            system: buildScanSubmissionsSystemPrompt(techniqueBlock),
            videoUrl: match.videoPublicUrl!,
            videoOptions: {
              startSeconds: match.matchStartSeconds ?? undefined,
              endSeconds: match.matchEndSeconds ?? undefined,
            },
            userPrompt: buildScanSubmissionsUserPrompt(topWindows),
            schema: SubmissionScanOutputSchema,
          })

          await db.insert(aiCallLogs).values({
            userId: match.userId ?? null,
            jobId: match.id,
            model: GEMINI_VIDEO_MODEL,
            promptVersion: SCAN_SUBMISSIONS_PROMPT_VERSION,
            tokensIn: scanResult.usage.inputTokens ?? 0,
            tokensOut: scanResult.usage.outputTokens ?? 0,
            costUsdEstimate: estimateCostUsd(GEMINI_VIDEO_MODEL, scanResult.usage.inputTokens ?? 0, scanResult.usage.outputTokens ?? 0),
            latencyMs: 0,
            status: 'success',
          })

          scanObject = scanResult.object
        } catch {
          return { added: 0, error: 'scan_failed' }
        }

        if (!scanObject?.events?.length) return { added: 0 }

        // Deduplicate against existing events — skip if same type within ±10s
        const newEvts = scanObject.events.filter((ev: any) =>
          ev.confidence >= 0.65 &&
          !allEvents.some((ex: any) =>
            ex.eventTypeId === ev.event_type_id &&
            Math.abs(ex.timestampSeconds - (ev.timestamp_seconds + tsOffset)) <= 10
          )
        )

        if (newEvts.length === 0) return { added: 0 }

        const now = new Date().toISOString()
        const summary = newEvts
          .map((ev: any) => `${ev.technique_label ?? ev.event_type_id} at ${Math.floor((ev.timestamp_seconds + tsOffset) / 60)}:${String(Math.floor((ev.timestamp_seconds + tsOffset) % 60)).padStart(2, '0')}`)
          .join(', ')

        await db.transaction(async (tx) => {
          await tx.insert(matchEvents).values(
            newEvts.map((ev: any) => ({
              matchId: match.id,
              timestampSeconds: ev.timestamp_seconds + tsOffset,
              eventTypeId: ev.event_type_id,
              actor: ev.actor,
              outcome: ev.outcome ?? 'ongoing',
              techniqueLabel: ev.technique_label ?? null,
              confidence: ev.confidence,
            }))
          )

          const prevChangelog: Array<{ at: string; added: number; summary: string }> = match.kbChangelog ?? []
          await tx.update(matches)
            .set({
              kbVersion: (match.kbVersion ?? 0) + 1,
              kbUpgradedAt: sql`now()`,
              kbChangelog: [...prevChangelog, { at: now, added: newEvts.length, summary }],
            })
            .where(eq(matches.id, match.id))
        })

        return { added: newEvts.length, summary }
      })

      if ((result as any).added > 0) {
        upgradeResults.push({
          matchId: match.id,
          userId: match.userId,
          opponentLabel: match.opponentLabel,
          added: (result as any).added,
        })
      }
    }

    // Send one batched notification per user
    await step.run('notify-users', async () => {
      const byUser: Record<string, typeof upgradeResults> = {}
      for (const r of upgradeResults) {
        if (!r.userId) continue
        if (!byUser[r.userId]) byUser[r.userId] = []
        byUser[r.userId].push(r)
      }

      for (const [userId, results] of Object.entries(byUser)) {
        const total = results.reduce((s, r) => s + r.added, 0)
        const names = results.map(r => r.opponentLabel).join(', ')
        const title = results.length === 1
          ? `Analysis upgraded: ${results[0].opponentLabel}`
          : `${results.length} opponent analyses upgraded`
        const body = results.length === 1
          ? `${total} new event${total > 1 ? 's' : ''} detected with improved technique library coverage.`
          : `${total} new events detected across ${names}.`

        await createNotification(userId, 'kb_upgrade', title, body, '/matches')
      }
    })

    return {
      variantsActivated: newVariants.length,
      matchesScanned: affectedMatches.length,
      matchesUpgraded: upgradeResults.length,
      totalEventsAdded: upgradeResults.reduce((s, r) => s + r.added, 0),
    }
  }
)
