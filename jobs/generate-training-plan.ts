import { generateObject } from 'ai'
import { inngest } from '../lib/inngest'
import { db } from '../lib/db'
import { matches, positionSegments, matchEvents, videos, tournaments, tournamentOpponents, playerCards } from '../lib/db/schema'
import { eq, and, inArray, desc, gt, sql } from 'drizzle-orm'
import { anthropic, CLAUDE_SYNTHESIS_MODEL } from '../lib/ai/clients'
import { TrainingPlanSchema } from '../lib/ai/schemas/training-plan'

const POSITION_LABELS: Record<string, string> = {
  closed_guard: 'closed guard', half_guard: 'half guard', open_guard: 'open guard',
  butterfly_guard: 'butterfly guard', back_control: 'back control', mount: 'mount',
  side_control: 'side control', turtle: 'turtle', north_south: 'north-south',
  knee_on_belly: 'knee on belly', standing: 'standing', x_guard: 'X-guard',
  deep_half: 'deep half', fifty_fifty: '50/50', single_leg_x: 'single-leg X',
  de_la_riva: 'De La Riva', reverse_de_la_riva: 'reverse De La Riva',
}
function fmtPos(id: string) { return POSITION_LABELS[id] ?? id.replace(/_/g, ' ') }

export const generateTrainingPlan = inngest.createFunction(
  {
    id: 'generate-training-plan',
    name: 'Generate Training Plan',
    triggers: [{ event: 'training-plan/generate' }],
    concurrency: { limit: 3 },
  },
  async ({ event, step }: { event: { data: { userId: string } }; step: any }) => {
    const { userId } = event.data

    // ── Step 1: Gather user match data ─────────────────────────────────────────
    const userData = await step.run('gather-user-data', async () => {
      const ownMatchRows = await db
        .select({ id: matches.id, resultWinner: matches.resultWinner })
        .from(matches)
        .innerJoin(videos, eq(videos.id, matches.videoId))
        .where(and(
          eq(matches.userId, userId),
          eq(matches.status, 'analysed'),
          inArray(videos.sourceType, ['own_competition', 'own_sparring']),
        ))
        .orderBy(desc(matches.createdAt))
        .limit(10)

      if (ownMatchRows.length === 0) return null

      const matchIds = ownMatchRows.map(m => m.id)

      const [posRows, evRows] = await Promise.all([
        db.select({
          positionId: positionSegments.positionId,
          userRole: positionSegments.userRole,
          dominance: positionSegments.dominance,
          startSeconds: positionSegments.startSeconds,
          endSeconds: positionSegments.endSeconds,
        }).from(positionSegments).where(inArray(positionSegments.matchId, matchIds)),
        db.select({
          techniqueLabel: matchEvents.techniqueLabel,
          actor: matchEvents.actor,
          outcome: matchEvents.outcome,
        }).from(matchEvents).where(inArray(matchEvents.matchId, matchIds)),
      ])

      // Position stats
      const posStats: Record<string, { total: number; top: number; bottom: number }> = {}
      for (const seg of posRows) {
        const secs = seg.endSeconds - seg.startSeconds
        posStats[seg.positionId] ??= { total: 0, top: 0, bottom: 0 }
        posStats[seg.positionId].total += secs
        if (seg.userRole === 'top') posStats[seg.positionId].top += secs
        if (seg.userRole === 'bottom') posStats[seg.positionId].bottom += secs
      }

      const totalSecs = Object.values(posStats).reduce((s, p) => s + p.total, 0)
      const topSecs = Object.values(posStats).reduce((s, p) => s + p.top, 0)

      // Positions user spends significant time defending from bottom
      const bottomPositions = Object.entries(posStats)
        .filter(([, s]) => s.bottom > 20)
        .sort((a, b) => b[1].bottom - a[1].bottom)
        .slice(0, 5)
        .map(([pos, s]) => `${fmtPos(pos)} (${Math.round(s.bottom)}s)`)

      // Top positions (user on top)
      const topPositions = Object.entries(posStats)
        .filter(([, s]) => s.top > 20)
        .sort((a, b) => b[1].top - a[1].top)
        .slice(0, 3)
        .map(([pos, s]) => `${fmtPos(pos)} (${Math.round(s.top)}s)`)

      // Attack success/fail
      const attackMap: Record<string, { success: number; fail: number }> = {}
      for (const ev of evRows) {
        if (ev.actor !== 'user' || !ev.techniqueLabel) continue
        attackMap[ev.techniqueLabel] ??= { success: 0, fail: 0 }
        if (ev.outcome === 'successful') attackMap[ev.techniqueLabel].success++
        else attackMap[ev.techniqueLabel].fail++
      }
      const attacks = Object.entries(attackMap)
        .map(([label, s]) => ({ label, total: s.success + s.fail, success: s.success }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map(a => `${a.label} (${a.success}/${a.total} success)`)

      const wins = ownMatchRows.filter(m => m.resultWinner === 'user').length

      return {
        matchCount: ownMatchRows.length,
        controlRate: totalSecs > 0 ? Math.round((topSecs / totalSecs) * 100) : 0,
        winRate: Math.round((wins / ownMatchRows.length) * 100),
        bottomPositions,
        topPositions,
        attacks,
      }
    })

    // ── Step 2: Gather upcoming opponent data ──────────────────────────────────
    const opponents = await step.run('gather-opponent-data', async () => {
      const rows = await db
        .select({
          opponentLabel: tournamentOpponents.opponentLabel,
          ajpWins: tournamentOpponents.ajpWins,
          ajpLosses: tournamentOpponents.ajpLosses,
          smoothcompWins: tournamentOpponents.smoothcompWins,
          smoothcompLosses: tournamentOpponents.smoothcompLosses,
          tournamentName: tournaments.name,
        })
        .from(tournamentOpponents)
        .innerJoin(tournaments, eq(tournaments.id, tournamentOpponents.tournamentId))
        .where(and(
          eq(tournaments.userId, userId),
          gt(tournaments.eventDate, sql`now()`)
        ))
        .limit(10)
      return rows
    })

    // ── Step 3: Generate plan ──────────────────────────────────────────────────
    const plan = await step.run('generate-plan', async () => {
      const sections: string[] = []

      if (userData) {
        sections.push(`ATHLETE DATA (${userData.matchCount} recent matches):
- Win rate: ${userData.winRate}%
- Control rate (top position): ${userData.controlRate}%
- Time defending from bottom: ${userData.bottomPositions.length > 0 ? userData.bottomPositions.join(', ') : 'none significant'}
- Top positions held: ${userData.topPositions.length > 0 ? userData.topPositions.join(', ') : 'none significant'}
- Techniques attempted: ${userData.attacks.length > 0 ? userData.attacks.join(', ') : 'none recorded'}`)
      } else {
        sections.push('ATHLETE DATA: No analysed matches yet — generate general BJJ fundamentals recommendations.')
      }

      if (opponents.length > 0) {
        const oppLines = opponents.map((o: typeof opponents[number]) =>
          `- ${o.opponentLabel} (${o.tournamentName}): AJP ${o.ajpWins ?? 0}W/${o.ajpLosses ?? 0}L, Smoothcomp ${o.smoothcompWins ?? 0}W/${o.smoothcompLosses ?? 0}L`
        )
        sections.push(`UPCOMING OPPONENTS (${opponents.length}):\n${oppLines.join('\n')}`)
      }

      const { object } = await generateObject({
        model: anthropic(CLAUDE_SYNTHESIS_MODEL),
        schema: TrainingPlanSchema,
        temperature: 0,
        messages: [{
          role: 'user',
          content: `You are an elite BJJ coach. Based on the following athlete data, recommend exactly 3 training priorities for the next training cycle.

${sections.join('\n\n')}

Rules:
1. Prioritise defensive gaps first (high bottom-position time = exploit risk)
2. Factor in upcoming opponent records where available — a high-record opponent amplifies the priority of addressing defensive gaps they likely exploit
3. Include at least one offensive drill to build on existing strengths
4. Each drill must be immediately actionable (specific rep counts, partner resistance level, etc.)
5. YouTube search: 3-6 words, specific technique name + "BJJ drill" or "BJJ tutorial"

Return 3 drills ordered: most critical first.`,
        }],
      })

      return object
    })

    // ── Step 4: Save to player_cards ───────────────────────────────────────────
    await step.run('save-plan', async () => {
      const existing = await db
        .select({ id: playerCards.id })
        .from(playerCards)
        .where(and(eq(playerCards.ownerId, userId), eq(playerCards.ownerType, 'user')))
        .limit(1)

      const now = new Date()

      if (existing[0]) {
        await db.update(playerCards)
          .set({ trainingPlan: plan, trainingPlanGeneratedAt: now })
          .where(eq(playerCards.id, existing[0].id))
      } else {
        await db.insert(playerCards).values({
          ownerType: 'user',
          ownerId: userId,
          trainingPlan: plan,
          trainingPlanGeneratedAt: now,
        })
      }
    })

    return { success: true, drillCount: plan.drills.length }
  }
)
