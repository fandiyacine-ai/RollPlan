import { db } from '../../../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import CoachSession from './coach-session'

export const dynamic = 'force-dynamic'

export default async function CoachPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params

  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match || match.status !== 'analysed') notFound()

  const video = match.videoId
    ? await db.query.videos.findFirst({ where: eq(videos.id, match.videoId) })
    : null

  const [segments, events, matchInsights] = await Promise.all([
    db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)).orderBy(asc(positionSegments.startSeconds)),
    db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.timestampSeconds)),
    db.select().from(insights).where(eq(insights.matchId, matchId)),
  ])

  return (
    <CoachSession
      match={{
        id: match.id,
        competitorLabel: match.competitorLabel,
        opponentLabel: match.opponentLabel,
        format: match.format,
        context: match.context,
        eventName: match.eventName,
      }}
      videoUrl={video?.publicUrl ?? null}
      segments={segments.map(s => ({
        id: s.id,
        startSeconds: s.startSeconds,
        endSeconds: s.endSeconds,
        positionId: s.positionId,
        userRole: s.userRole,
        dominance: s.dominance,
      }))}
      events={events.map(e => ({
        id: e.id,
        timestampSeconds: e.timestampSeconds,
        eventTypeId: e.eventTypeId,
        actor: e.actor,
        outcome: e.outcome,
        techniqueLabel: e.techniqueLabel,
      }))}
      insights={matchInsights.map(i => ({
        id: i.id,
        category: i.category,
        severity: i.severity,
        description: i.description,
        suggestion: i.suggestion,
      }))}
    />
  )
}
