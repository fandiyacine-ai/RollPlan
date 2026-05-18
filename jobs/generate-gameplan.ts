import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournaments, tournamentOpponents, gameplans, matches, positionSegments, matchEvents, insights, aiCallLogs } from '../lib/db/schema'
import { eq, desc, and, isNull } from 'drizzle-orm'
import { anthropic, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { GameplanOutputSchema, GameplanOutput } from '../lib/ai/schemas/gameplan'
import { buildGameplanSystemPrompt, buildGameplanUserPrompt, GENERATE_GAMEPLAN_PROMPT_VERSION } from '../lib/ai/prompts/generate-gameplan'

async function fetchMatchData(matchId: string) {
  const [segments, events, matchInsights] = await Promise.all([
    db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)),
    db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)),
    db.select().from(insights).where(eq(insights.matchId, matchId)),
  ])
  return { segments, events, insights: matchInsights }
}

export const generateGameplan = inngest.createFunction(
  {
    id: 'generate-gameplan',
    name: 'Generate Tournament Gameplan',
    triggers: [{ event: 'gameplan/requested' }],
  },
  async ({ event, step }: { event: { data: { tournamentId: string; opponentId: string; userId?: string } }; step: any }) => {
    const { tournamentId, opponentId, userId } = event.data

    const gameplanData = await step.run('fetch-data', async () => {
      const tournament = await db.query.tournaments.findFirst({ where: eq(tournaments.id, tournamentId) })
      if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

      const opponent = await db.query.tournamentOpponents.findFirst({ where: eq(tournamentOpponents.id, opponentId) })
      if (!opponent) throw new Error(`Opponent ${opponentId} not found`)

      // User's own analysed matches — scoped to this user, not opponent scouting
      const ownMatchFilter = userId
        ? and(eq(matches.status, 'analysed'), eq(matches.userId, userId), isNull(matches.tournamentOpponentId))
        : and(eq(matches.status, 'analysed'), isNull(matches.tournamentOpponentId))
      const ownMatches = await db
        .select()
        .from(matches)
        .where(ownMatchFilter)
        .orderBy(desc(matches.createdAt))
        .limit(10)

      // Opponent's scouted matches
      const opponentMatchRows = await db
        .select()
        .from(matches)
        .where(eq(matches.tournamentOpponentId, opponentId))

      const yourMatches = await Promise.all(
        ownMatches.map(async (m) => {
          const { segments, events, insights } = await fetchMatchData(m.id)
          return {
            id: m.id,
            opponentLabel: m.opponentLabel,
            format: m.format,
            ruleset: m.ruleset,
            segments: segments.map(s => ({
              id: s.id, positionId: s.positionId, userRole: s.userRole,
              dominance: s.dominance, startSeconds: s.startSeconds,
              endSeconds: s.endSeconds, confidence: s.confidence,
            })),
            events: events.map(e => ({
              id: e.id, eventTypeId: e.eventTypeId, actor: e.actor,
              outcome: e.outcome, techniqueLabel: e.techniqueLabel,
              timestampSeconds: e.timestampSeconds, confidence: e.confidence,
            })),
            insights: insights.map(i => ({
              id: i.id, category: i.category, severity: i.severity,
              description: i.description, suggestion: i.suggestion,
            })),
          }
        })
      )

      const opponentMatches = await Promise.all(
        opponentMatchRows.map(async (m) => {
          const { segments, events, insights } = await fetchMatchData(m.id)
          return {
            id: m.id,
            vsOpponent: m.opponentLabel,
            format: m.format,
            segments: segments.map(s => ({
              id: s.id, positionId: s.positionId, userRole: s.userRole,
              dominance: s.dominance, startSeconds: s.startSeconds,
              endSeconds: s.endSeconds, confidence: s.confidence,
            })),
            events: events.map(e => ({
              id: e.id, eventTypeId: e.eventTypeId, actor: e.actor,
              outcome: e.outcome, techniqueLabel: e.techniqueLabel,
              timestampSeconds: e.timestampSeconds, confidence: e.confidence,
            })),
            insights: insights.map(i => ({
              id: i.id, category: i.category, severity: i.severity,
              description: i.description, suggestion: i.suggestion,
            })),
          }
        })
      )

      return {
        tournament: {
          name: tournament.name,
          format: tournament.ruleset.startsWith('adcc') ? 'no_gi' : (tournament.ruleset === 'ebi' ? 'no_gi' : 'gi'),
          ruleset: tournament.ruleset,
          division: tournament.division,
          eventDate: tournament.eventDate,
        },
        opponent: { name: opponent.opponentLabel, notes: opponent.seedingNotes },
        yourMatches,
        opponentMatches,
      }
    }) as Parameters<typeof buildGameplanUserPrompt>[0]

    const { plan, usage, latencyMs } = await step.run('synthesise-gameplan', async () => {
      const start = Date.now()
      const { object, usage } = await generateObject({
        model: anthropic(CLAUDE_SYNTHESIS_MODEL),
        schema: GameplanOutputSchema,
        maxRetries: 0,
        system: buildGameplanSystemPrompt(),
        prompt: buildGameplanUserPrompt(gameplanData),
      })
      return { plan: object, usage, latencyMs: Date.now() - start }
    }) as { plan: GameplanOutput; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }

    await step.run('store-gameplan', async () => {
      const existingGameplan = await db.query.gameplans.findFirst({
        where: eq(gameplans.opponentId, opponentId),
      })

      if (existingGameplan) {
        await db.update(gameplans).set({
          structuredPlan: plan as any,
          version: existingGameplan.version + 1,
          promptVersion: GENERATE_GAMEPLAN_PROMPT_VERSION,
          status: 'committed',
        }).where(eq(gameplans.id, existingGameplan.id))
      } else {
        await db.insert(gameplans).values({
          tournamentId,
          opponentId,
          structuredPlan: plan as any,
          promptVersion: GENERATE_GAMEPLAN_PROMPT_VERSION,
          status: 'committed',
          evidence: {
            user_match_ids: gameplanData.yourMatches.map(m => m.id),
            opponent_match_ids: gameplanData.opponentMatches.map(m => m.id),
          },
        })
      }

      await db.insert(aiCallLogs).values({
        jobId: tournamentId,
        model: CLAUDE_SYNTHESIS_MODEL,
        promptVersion: GENERATE_GAMEPLAN_PROMPT_VERSION,
        tokensIn: usage.inputTokens ?? 0,
        tokensOut: usage.outputTokens ?? 0,
        costUsdEstimate: estimateCostUsd(CLAUDE_SYNTHESIS_MODEL, usage.inputTokens ?? 0, usage.outputTokens ?? 0),
        latencyMs,
        status: 'success',
      })
    })

    return { tournamentId, opponentId, yourMatchCount: gameplanData.yourMatches.length, opponentMatchCount: gameplanData.opponentMatches.length }
  }
)
