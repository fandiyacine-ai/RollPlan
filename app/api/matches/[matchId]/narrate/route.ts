import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../lib/db'
import { matches, positionSegments, matchEvents, insights } from '../../../../../lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { generateText } from 'ai'
import { anthropic, CLAUDE_SYNTHESIS_MODEL } from '../../../../../lib/ai/clients'
import { buildNarrationSystemPrompt, buildNarrationUserPrompt } from '../../../../../lib/ai/prompts/generate-narration'
import { POSITIONS } from '../../../../../lib/taxonomy/positions'
import { EVENT_TYPES } from '../../../../../lib/taxonomy/events'
import { auth } from '@clerk/nextjs/server'

export const maxDuration = 60

const POSITION_MAP = Object.fromEntries(POSITIONS.map(p => [p.id, p.name]))
const EVENT_MAP = Object.fromEntries(EVENT_TYPES.map(e => [e.id, e.name]))

function fmt(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return sec > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${m}:00`
}

function dominanceLabel(d: string, competitor: string, opponent: string): string {
  if (d === 'dominant') return `${competitor} controlling`
  if (d === 'inferior') return `${opponent} controlling`
  return 'neutral'
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  try {
    await auth()

    const { matchId } = await params

    const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) })
    if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    if (match.status !== 'analysed') return NextResponse.json({ error: 'Match not analysed yet' }, { status: 400 })

    const [segments, events, matchInsights] = await Promise.all([
      db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)).orderBy(asc(positionSegments.startSeconds)),
      db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.timestampSeconds)),
      db.select().from(insights).where(eq(insights.matchId, matchId)),
    ])

    const competitor = match.competitorLabel?.trim() || 'Athlete'
    const opponent = match.opponentLabel?.trim() || 'Opponent'

    // Build merged timeline using real names
    type TLItem = { time: number; type: 'position' | 'event'; description: string }
    const posItems: TLItem[] = segments.map(s => ({
      time: s.startSeconds,
      type: 'position',
      description: `${POSITION_MAP[s.positionId] ?? s.positionId} — ${dominanceLabel(s.dominance, competitor, opponent)} (${fmt(s.endSeconds - s.startSeconds)})`,
    }))
    const evtItems: TLItem[] = events.map(e => ({
      time: e.timestampSeconds,
      type: 'event',
      description: [
        e.actor === 'user' ? competitor : opponent,
        EVENT_MAP[e.eventTypeId] ?? e.eventTypeId,
        e.techniqueLabel ? `(${e.techniqueLabel})` : null,
        e.outcome ? `→ ${e.outcome}` : null,
      ].filter(Boolean).join(' '),
    }))
    const timelineItems = [...posItems, ...evtItems]
      .sort((a, b) => a.time - b.time)
      .map(t => ({ type: t.type, time: fmt(t.time), description: t.description }))

    const { text } = await generateText({
      model: anthropic(CLAUDE_SYNTHESIS_MODEL),
      system: buildNarrationSystemPrompt(),
      prompt: buildNarrationUserPrompt({
        match: {
          format: match.format,
          context: match.context,
          eventName: match.eventName,
          opponentLabel: match.opponentLabel,
          competitorLabel: match.competitorLabel,
          date: (match.recordedAt ?? match.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        },
        timeline: timelineItems,
        insights: matchInsights.map(i => ({
          category: i.category,
          description: i.description,
          suggestion: i.suggestion,
        })),
      }),
      maxOutputTokens: 600,
    })

    await db.update(matches).set({ narration: text.trim() }).where(eq(matches.id, matchId))

    return NextResponse.json({ narration: text.trim() })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[narrate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
