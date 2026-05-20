import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { tournaments, tournamentOpponents, gameplans, matches, positionSegments, matchEvents, insights, aiCallLogs } from '../lib/db/schema'
import { eq, desc, and, isNull } from 'drizzle-orm'
import { anthropic, CLAUDE_SYNTHESIS_MODEL, estimateCostUsd } from '../lib/ai/clients'
import { GameplanOutputSchema, GameplanOutput } from '../lib/ai/schemas/gameplan'
import { MatchupPredictionSchema, MatchupPrediction } from '../lib/ai/schemas/prediction'
import { buildGameplanSystemPrompt, buildGameplanUserPrompt, GENERATE_GAMEPLAN_PROMPT_VERSION } from '../lib/ai/prompts/generate-gameplan'
import { buildPredictionSystemPrompt, buildPredictionUserPrompt, GENERATE_PREDICTION_PROMPT_VERSION } from '../lib/ai/prompts/generate-prediction'

type MatchStats = {
  matchCount: number
  topPositionSeconds: number
  bottomPositionSeconds: number
  submissionWins: number
  submissionLosses: number
  dominantPositions: string[]
  commonSubmissions: string[]
  controlRate: number
  winRate: number
}

function computeMatchStats(
  matchRows: Array<{ id: string; resultWinner: string | null; resultMethod: string | null; resultTechnique: string | null }>,
  allSegments: Array<{ matchId: string; positionId: string; userRole: string; dominance: string; startSeconds: number; endSeconds: number }>,
  allEvents: Array<{ matchId: string; eventTypeId: string; actor: string; outcome: string | null; techniqueLabel: string | null }>,
  perspective: 'user' | 'opponent',  // 'user' = coached athlete, 'opponent' = scouted athlete
): MatchStats {
  const matchIds = new Set(matchRows.map(m => m.id))
  const segments = allSegments.filter(s => matchIds.has(s.matchId))
  const events = allEvents.filter(e => matchIds.has(e.matchId))

  let topSec = 0, bottomSec = 0, dominantSec = 0, totalSec = 0
  const positionTime: Record<string, number> = {}

  for (const s of segments) {
    const dur = Math.max(0, s.endSeconds - s.startSeconds)
    totalSec += dur
    if (s.userRole === 'top') topSec += dur
    if (s.userRole === 'bottom') bottomSec += dur
    if (s.dominance === 'dominant') dominantSec += dur
    positionTime[s.positionId] = (positionTime[s.positionId] ?? 0) + dur
  }

  const dominantPositions = Object.entries(positionTime)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)

  const subWinActor = perspective === 'user' ? 'user' : 'opponent'
  const subLossActor = perspective === 'user' ? 'opponent' : 'user'

  const submissionWins = events.filter(e => e.actor === subWinActor && e.eventTypeId.includes('submission') && e.outcome === 'success').length
  const submissionLosses = events.filter(e => e.actor === subLossActor && e.eventTypeId.includes('submission') && e.outcome === 'success').length

  const subTechniques = events
    .filter(e => e.actor === subWinActor && e.eventTypeId.includes('submission') && e.techniqueLabel)
    .map(e => e.techniqueLabel!)
  const techCounts: Record<string, number> = {}
  for (const t of subTechniques) techCounts[t] = (techCounts[t] ?? 0) + 1
  const commonSubmissions = Object.entries(techCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t)

  const matchesWithResult = matchRows.filter(m => m.resultWinner)
  const winnerKey = perspective === 'user' ? 'user' : 'opponent'
  const wins = matchesWithResult.filter(m => m.resultWinner === winnerKey).length
  const winRate = matchesWithResult.length > 0 ? wins / matchesWithResult.length : 0.5

  return {
    matchCount: matchRows.length,
    topPositionSeconds: topSec,
    bottomPositionSeconds: bottomSec,
    submissionWins,
    submissionLosses,
    dominantPositions,
    commonSubmissions,
    controlRate: totalSec > 0 ? dominantSec / totalSec : 0,
    winRate,
  }
}

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

      const evidence = {
        user_match_ids: gameplanData.yourMatches.map(m => m.id),
        opponent_match_ids: gameplanData.opponentMatches.map(m => m.id),
      }

      if (existingGameplan) {
        await db.update(gameplans).set({
          structuredPlan: plan as any,
          version: existingGameplan.status === 'generating' ? existingGameplan.version : existingGameplan.version + 1,
          promptVersion: GENERATE_GAMEPLAN_PROMPT_VERSION,
          status: 'committed',
          evidence,
        }).where(eq(gameplans.id, existingGameplan.id))
      } else {
        await db.insert(gameplans).values({
          tournamentId,
          opponentId,
          structuredPlan: plan as any,
          promptVersion: GENERATE_GAMEPLAN_PROMPT_VERSION,
          status: 'committed',
          evidence,
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

    const prediction = await step.run('generate-prediction', async () => {
      // Flatten segments + events from the fetched match data
      const yourSegments = gameplanData.yourMatches.flatMap(m =>
        m.segments.map(s => ({ matchId: m.id, ...s }))
      )
      const yourEvents = gameplanData.yourMatches.flatMap(m =>
        m.events.map(e => ({ matchId: m.id, ...e }))
      )
      const oppSegments = gameplanData.opponentMatches.flatMap(m =>
        m.segments.map(s => ({ matchId: m.id, ...s }))
      )
      const oppEvents = gameplanData.opponentMatches.flatMap(m =>
        m.events.map(e => ({ matchId: m.id, ...e }))
      )

      // Build match rows with result data — gameplanData doesn't carry resultWinner,
      // so we use empty arrays (winRate defaults to 0.5); a follow-up can enrich this.
      const yourMatchRows = gameplanData.yourMatches.map(m => ({ id: m.id, resultWinner: null, resultMethod: null, resultTechnique: null }))
      const oppMatchRows = gameplanData.opponentMatches.map(m => ({ id: m.id, resultWinner: null, resultMethod: null, resultTechnique: null }))

      const yourStats = computeMatchStats(yourMatchRows, yourSegments, yourEvents, 'user')
      const opponentStats = computeMatchStats(oppMatchRows, oppSegments, oppEvents, 'opponent')

      const { object } = await generateObject({
        model: anthropic(CLAUDE_SYNTHESIS_MODEL),
        schema: MatchupPredictionSchema,
        maxRetries: 0,
        system: buildPredictionSystemPrompt(),
        prompt: buildPredictionUserPrompt({
          tournament: gameplanData.tournament,
          opponent: gameplanData.opponent,
          yourStats,
          opponentStats,
        }),
      })
      return object as MatchupPrediction
    }).catch(() => null)  // prediction failure must never block the gameplan

    if (prediction) {
      await step.run('store-prediction', async () => {
        const gp = await db.query.gameplans.findFirst({ where: eq(gameplans.opponentId, opponentId) })
        if (gp) {
          await db.update(gameplans).set({ prediction: prediction as any }).where(eq(gameplans.id, gp.id))
        }
      })
    }

    return { tournamentId, opponentId, yourMatchCount: gameplanData.yourMatches.length, opponentMatchCount: gameplanData.opponentMatches.length }
  }
)
