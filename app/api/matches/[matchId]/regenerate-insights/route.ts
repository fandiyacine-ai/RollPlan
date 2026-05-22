import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../../../../../lib/ai/clients'
import { db } from '../../../../../lib/db'
import { matches, positionSegments, matchEvents, insights, aiCallLogs } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { InsightsOutputSchema } from '../../../../../lib/ai/schemas/insights'
import { buildGenerateInsightsSystemPrompt, GENERATE_INSIGHTS_PROMPT_VERSION } from '../../../../../lib/ai/prompts/generate-insights'
import { auth } from '@clerk/nextjs/server'

export const maxDuration = 60

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  await auth()

  const { matchId } = await params
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })

  const [segments, events] = await Promise.all([
    db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)).orderBy(asc(positionSegments.startSeconds)),
    db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.timestampSeconds)),
  ])

  if (segments.length === 0) return NextResponse.json({ error: 'No position data to analyse' }, { status: 400 })

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

  const start = Date.now()
  const { object: insightObj, usage } = await generateObject({
    model: anthropic(CLAUDE_SYNTHESIS_MODEL),
    schema: InsightsOutputSchema,
    maxRetries: 0,
    system: buildGenerateInsightsSystemPrompt(
      match.competitorLabel ?? 'athlete',
      match.opponentLabel ?? 'opponent'
    ),
    prompt: JSON.stringify(matchData),
  })

  // Replace all existing insights atomically
  await db.transaction(async (tx) => {
    await tx.delete(insights).where(eq(insights.matchId, matchId))
    await tx.insert(insights).values(
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
    await tx.insert(aiCallLogs).values({
      userId: match.userId,
      jobId: matchId,
      model: CLAUDE_SYNTHESIS_MODEL,
      promptVersion: GENERATE_INSIGHTS_PROMPT_VERSION,
      tokensIn: usage.inputTokens ?? 0,
      tokensOut: usage.outputTokens ?? 0,
      costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
      latencyMs: Date.now() - start,
      status: 'success',
    })
  })

  return NextResponse.json({ ok: true, count: insightObj.insights.length })
}
