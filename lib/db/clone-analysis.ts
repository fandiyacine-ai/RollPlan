import { db } from '.'
import { matches, positionSegments, matchEvents, insights, videos } from './schema'
import { eq, and, inArray } from 'drizzle-orm'

// Clone all analysed matches from one opponent to another.
// Used when importing community footage (cross-user Smoothcomp athlete dedup).
// The target opponent gets new match/segment/event/insight rows; the source is unchanged.
export async function cloneOpponentMatches(
  sourceOpponentId: string,
  targetOpponentId: string,
  targetUserId: string,
): Promise<{ cloned: number }> {
  const sourceMatches = await db.select().from(matches).where(
    and(eq(matches.tournamentOpponentId, sourceOpponentId), eq(matches.status, 'analysed'))
  )
  if (sourceMatches.length === 0) return { cloned: 0 }
  return cloneMatchList(sourceMatches, targetOpponentId, targetUserId)
}

// Clone all analysed matches from a video to a new video+opponent.
// Used for URL dedup: same YouTube URL already analysed → clone results, skip Gemini.
export async function cloneVideoMatches(
  sourceVideoId: string,
  targetVideoId: string,
  targetOpponentId: string,
  targetUserId: string,
): Promise<{ cloned: number }> {
  const sourceMatches = await db.select().from(matches).where(
    and(eq(matches.videoId, sourceVideoId), eq(matches.status, 'analysed'))
  )
  if (sourceMatches.length === 0) return { cloned: 0 }

  const result = await cloneMatchList(sourceMatches, targetOpponentId, targetUserId, targetVideoId)

  // Mark the target video as analysed now that matches are ready
  await db.update(videos).set({ status: 'analysed' }).where(eq(videos.id, targetVideoId))

  return result
}

async function cloneMatchList(
  sourceMatches: (typeof matches.$inferSelect)[],
  targetOpponentId: string,
  targetUserId: string,
  overrideVideoId?: string,
): Promise<{ cloned: number }> {
  const sourceMatchIds = sourceMatches.map(m => m.id)

  const [allSegments, allEvents, allInsights] = await Promise.all([
    db.select().from(positionSegments).where(inArray(positionSegments.matchId, sourceMatchIds)),
    db.select().from(matchEvents).where(inArray(matchEvents.matchId, sourceMatchIds)),
    db.select().from(insights).where(inArray(insights.matchId, sourceMatchIds)),
  ])

  let cloned = 0

  for (const src of sourceMatches) {
    const [newMatch] = await db.insert(matches).values({
      videoId: overrideVideoId ?? src.videoId,
      userId: targetUserId,
      competitorLabel: src.competitorLabel,
      opponentLabel: src.opponentLabel,
      format: src.format,
      context: src.context,
      ruleset: src.ruleset,
      eventName: src.eventName,
      userNotes: src.userNotes,
      durationSeconds: src.durationSeconds,
      tournamentOpponentId: targetOpponentId,
      status: 'analysed',
      resultWinner: src.resultWinner,
      resultMethod: src.resultMethod,
      resultTechnique: src.resultTechnique,
    }).returning()

    const segs = allSegments.filter(s => s.matchId === src.id)
    const evts = allEvents.filter(e => e.matchId === src.id)
    const ins = allInsights.filter(i => i.matchId === src.id)

    // Clone segments and build old→new ID map so insight evidence links stay valid
    const segIdMap = new Map<string, string>()
    if (segs.length > 0) {
      const newSegs = await db.insert(positionSegments).values(
        segs.map(s => ({
          matchId: newMatch.id,
          startSeconds: s.startSeconds,
          endSeconds: s.endSeconds,
          positionId: s.positionId,
          userRole: s.userRole,
          dominance: s.dominance,
          confidence: s.confidence,
          userBbox: s.userBbox,
          opponentBbox: s.opponentBbox,
        }))
      ).returning()
      segs.forEach((s, i) => segIdMap.set(s.id, newSegs[i].id))
    }

    const evtIdMap = new Map<string, string>()
    if (evts.length > 0) {
      const newEvts = await db.insert(matchEvents).values(
        evts.map(e => ({
          matchId: newMatch.id,
          timestampSeconds: e.timestampSeconds,
          eventTypeId: e.eventTypeId,
          actor: e.actor,
          outcome: e.outcome,
          techniqueLabel: e.techniqueLabel,
          confidence: e.confidence,
        }))
      ).returning()
      evts.forEach((e, i) => evtIdMap.set(e.id, newEvts[i].id))
    }

    if (ins.length > 0) {
      await db.insert(insights).values(
        ins.map(i => ({
          matchId: newMatch.id,
          category: i.category,
          severity: i.severity,
          description: i.description,
          suggestion: i.suggestion,
          conceptTags: i.conceptTags,
          // Remap evidence IDs so highlight links work in the cloned match
          evidenceSegmentIds: (i.evidenceSegmentIds as string[]).map(id => segIdMap.get(id) ?? id),
          evidenceEventIds: (i.evidenceEventIds as string[]).map(id => evtIdMap.get(id) ?? id),
          confidence: i.confidence,
          youtubeSearchQuery: i.youtubeSearchQuery,
          promptVersion: i.promptVersion,
        }))
      )
    }

    cloned++
  }

  return { cloned }
}
