import { NextRequest } from 'next/server'
import { streamText } from 'ai'
import { anthropic, CLAUDE_SYNTHESIS_MODEL } from '../../../lib/ai/clients'
import { db } from '../../../lib/db'
import { matches, videos, positionSegments, matchEvents, insights } from '../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { getTechniqueVariantsByEvents, formatVariantsAsPromptBlock, formatVariantsAsCounterGuide } from '../../../lib/ai/technique-retrieval'

export const maxDuration = 30

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const { matchId, message, currentTimestampSeconds = 0, frameDataUrl, mode } = await req.json()
  const isScouting = mode === 'scouting'

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

  // Fetch technique knowledge relevant to this match's observed events
  const observedEventIds = [...new Set(events.map(e => e.eventTypeId))]
  const techniqueVariants = await getTechniqueVariantsByEvents(
    observedEventIds,
    match.format as 'gi' | 'no_gi'
  )

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

  const techniqueBlock = formatVariantsAsPromptBlock(techniqueVariants)
  const counterBlock = formatVariantsAsCounterGuide(techniqueVariants)

  const opponent = match.opponentLabel ?? 'the opponent'
  const system = isScouting
    ? `You are an expert BJJ scout helping an athlete prepare for a match against ${opponent}. You have analysed ${opponent}'s footage and have the full breakdown below. Answer every question from the perspective of someone preparing to FACE this opponent — not coaching ${opponent} themselves.
${techniqueBlock ? `\n${techniqueBlock}\n` : ''}${counterBlock ? `\n${counterBlock}\n` : ''}

Scout report for: ${opponent}
Match footage: ${match.format === 'no_gi' ? 'No-Gi' : 'Gi'}${match.eventName ? ` — ${match.eventName}` : ''}

${opponent}'s position timeline:
${segmentTimeline}

${opponent}'s key events:
${eventTimeline}

Pre-analysed scouting insights:
${insightLines}

Currently watching: ${fmt(currentTimestampSeconds)}
${opponent}'s position at this moment: ${currentPosition}
${opponent}'s events at this moment: ${currentEvents}

Scouting guidelines:
- Always refer to the opponent by name (${opponent}), never "you"
- Frame everything as preparation advice: "watch for…", "when ${opponent} does X, counter with…"
- Reference specific timestamps from the data above
- 2-4 sentences max unless the question genuinely needs more
- Be tactical — give the athlete something actionable to use on the mat
- Respond in the same language as the question`
    : `You are an expert BJJ coach reviewing match footage side-by-side with your athlete. You have access to the full match analysis.
${techniqueBlock ? `\n${techniqueBlock}\n` : ''}${counterBlock ? `\n${counterBlock}\n` : ''}

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
