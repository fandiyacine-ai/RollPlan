import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { gameplans, planExecutions, positionSegments, matchEvents, matches } from '../lib/db/schema'
import { eq } from 'drizzle-orm'
import { anthropic, CLAUDE_SYNTHESIS_MODEL } from '../lib/ai/clients'
import { ExecutionDebriefSchema, type ExecutionDebrief } from '../lib/ai/schemas/execution-debrief'
import { buildDebriefSystemPrompt, buildDebriefUserPrompt, GENERATE_EXECUTION_DEBRIEF_PROMPT_VERSION } from '../lib/ai/prompts/generate-execution-debrief'
import type { GameplanOutput } from '../lib/ai/schemas/gameplan'

export const generateExecutionDebrief = inngest.createFunction(
  {
    id: 'generate-execution-debrief',
    name: 'Generate Plan Execution Debrief',
    triggers: [{ event: 'execution-debrief/requested' }],
  },
  async ({ event, step }: { event: { data: { planExecutionId: string; gameplanId: string; matchId: string } }; step: any }) => {
    const { planExecutionId, gameplanId, matchId } = event.data

    const debriefData = await step.run('fetch-data', async () => {
      const [gp, matchRows, segments, events] = await Promise.all([
        db.query.gameplans.findFirst({ where: eq(gameplans.id, gameplanId) }),
        db.select().from(matches).where(eq(matches.id, matchId)).limit(1),
        db.select().from(positionSegments).where(eq(positionSegments.matchId, matchId)),
        db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)),
      ])
      if (!gp) throw new Error(`Gameplan ${gameplanId} not found`)
      const match = matchRows[0]
      if (!match) throw new Error(`Match ${matchId} not found`)
      return {
        gameplan: gp.structuredPlan as GameplanOutput,
        match,
        segments,
        events,
      }
    })

    const debrief = await step.run('generate-debrief', async () => {
      const { object } = await generateObject({
        model: anthropic(CLAUDE_SYNTHESIS_MODEL),
        schema: ExecutionDebriefSchema,
        maxRetries: 0,
        system: buildDebriefSystemPrompt(),
        prompt: buildDebriefUserPrompt({
          gameplan: debriefData.gameplan,
          match: {
            result: {
              winner: debriefData.match.resultWinner,
              method: debriefData.match.resultMethod,
              technique: debriefData.match.resultTechnique,
            },
            segments: debriefData.segments.map((s: typeof debriefData.segments[number]) => ({
              positionId: s.positionId,
              userRole: s.userRole,
              dominance: s.dominance,
              durationSeconds: Math.max(0, s.endSeconds - s.startSeconds),
            })),
            events: debriefData.events.map((e: typeof debriefData.events[number]) => ({
              eventTypeId: e.eventTypeId,
              actor: e.actor,
              outcome: e.outcome,
              techniqueLabel: e.techniqueLabel,
              timestampSeconds: e.timestampSeconds,
            })),
          },
        }),
      })
      return object as ExecutionDebrief
    })

    await step.run('store-debrief', async () => {
      await db
        .update(planExecutions)
        .set({ executionReview: debrief as any })
        .where(eq(planExecutions.id, planExecutionId))
    })

    return { planExecutionId, verdict: debrief.verdict }
  },
)
