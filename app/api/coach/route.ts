import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { anthropic, CLAUDE_SYNTHESIS_MODEL } from '../../../lib/ai/clients'
import { db } from '../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights } from '../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'

export const maxDuration = 30

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const { matchId, message, currentTimestampSeconds = 0, frameDataUrl } = await req.json()

  if (!matchId || !message?.trim()) {
    return new Response(JSON.stringify({ error: 'matchId and message are required' }), { status: 400 })
  }

  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
  if (!match) return new Response(JSON.stringify({ error: 'Match not found' }), { status: 404 })

  const video = match.videoId
    ? await db.query.videos.findFirst({ where: eq(videos.id, match.videoId) })
    : null

  const [segments, events, matchInsights] = await Promise.all([
    db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)).orderBy(asc(positionSegments.startSeconds)),
    db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.timestampSeconds)),
    db.select().from(insights).where(eq(insights.matchId, matchId)),
  ])

  const nearbySegments = segments.filter(s =>
    s.startSeconds <= currentTimestampSeconds + 30 && s.endSeconds >= currentTimestampSeconds - 30
  )
  const nearbyEvents = events.filter(e => Math.abs(e.timestampSeconds - currentTimestampSeconds) <= 30)

  const segmentTimeline = segments.length > 0
    ? segments.map(s => `${fmt(s.startSeconds)}-${fmt(s.endSeconds)}: ${s.positionId} (${s.userRole}, ${s.dominance})`).join('\n')
    : 'No position data recorded'

  const eventTimeline = events.length > 0
    ? events.map(e => `${fmt(e.timestampSeconds)}: ${e.eventTypeId} by ${e.actor} — ${e.outcome}${e.techniqueLabel ? ` (${e.techniqueLabel})` : ''}`).join('\n')
    : 'No events recorded'

  const insightLines = matchInsights.length > 0
    ? matchInsights.map(i => `[${i.category.toUpperCase()}] ${i.description} → ${i.suggestion}`).join('\n')
    : 'No insights yet'

  const currentPosition = nearbySegments.length > 0
    ? nearbySegments.map(s => `${s.positionId} (${s.userRole}, ${s.dominance})`).join(', ')
    : 'transition / unclear'

  const currentEvents = nearbyEvents.length > 0
    ? nearbyEvents.map(e => `${e.eventTypeId} by ${e.actor} — ${e.outcome}`).join(', ')
    : 'none'

  const system = `You are an expert BJJ coach reviewing match footage side-by-side with your athlete. You have access to the full match analysis.

Match: ${match.format === 'no_gi' ? 'No-Gi' : 'Gi'} ${match.context}${match.eventName ? ` — ${match.eventName}` : ''}
Athlete: ${match.competitorLabel ?? 'your athlete'} vs ${match.opponentLabel}
${video ? `Video: ${video.originalFilename ?? video.publicUrl}` : ''}

Position timeline:
${segmentTimeline}

Key events:
${eventTimeline}

Pre-analysed insights:
${insightLines}

Athlete is currently watching: ${fmt(currentTimestampSeconds)}
Position at this moment: ${currentPosition}
Events at this moment: ${currentEvents}

Coaching guidelines:
- Reference specific timestamps and positions from the data above when relevant
- 2-4 sentences max unless the question genuinely needs more
- Speak directly: "you" and "your", never "the athlete"
- Be actionable — what to fix or drill, not just what went wrong
- Respond in the same language as the athlete's question`

  const result = streamText({
    model: anthropic(CLAUDE_SYNTHESIS_MODEL),
    system,
    messages: [{
      role: 'user',
      content: [
        ...(frameDataUrl ? [{ type: 'image' as const, image: frameDataUrl }] : []),
        { type: 'text' as const, text: message },
      ],
    }],
    maxOutputTokens: 400,
  })

  return result.toTextStreamResponse()
}
