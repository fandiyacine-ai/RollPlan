import { currentUser } from '@clerk/nextjs/server'
import { db } from '../../../../../lib/db'
import { gameplans, tournamentOpponents, matches, planExecutions } from '../../../../../lib/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { GenerateGameplanButton } from './generate-button'
import { OpponentSelector } from './opponent-selector'
import { PrintButton } from './print-button'
import { GameplanRatingWidget } from './rating-widget'
import { AutoRefresh } from './auto-refresh'
import { PlanExecutionSection } from './plan-execution-section'
import type { GameplanOutput } from '../../../../../lib/ai/schemas/gameplan'
import type { MatchupPrediction } from '../../../../../lib/ai/schemas/prediction'
import type { ExecutionDebrief } from '../../../../../lib/ai/schemas/execution-debrief'

export const dynamic = 'force-dynamic'

export default async function GameplanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ opponent?: string }>
}) {
  const { id: tournamentId } = await params
  const { opponent: selectedOpponentId } = await searchParams

  const clerkUser = await currentUser().catch(() => null)
  const athleteName = clerkUser?.firstName ?? clerkUser?.username ?? null

  const opponents = await db
    .select()
    .from(tournamentOpponents)
    .where(eq(tournamentOpponents.tournamentId, tournamentId))

  if (opponents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-primary text-sm font-semibold">Step 3 of 3</span>
          <div className="flex items-center gap-1">
            <span className="text-primary text-lg">●</span>
            <span className="text-primary text-lg">●</span>
            <span className="text-primary text-lg">●</span>
          </div>
        </div>
        <p className="font-semibold">No opponents added yet</p>
        <p className="text-sm text-muted-foreground">
          <Link href={`/tournaments/${tournamentId}/opponents`} className="underline hover:no-underline">
            Add opponents and scout their footage
          </Link>{' '}
          first — then come back here to generate your gameplan.
        </p>
      </div>
    )
  }

  const activeOpponent = selectedOpponentId
    ? opponents.find(o => o.id === selectedOpponentId) ?? opponents[0]
    : opponents[0]

  const scoutedMatches = await db
    .select({
      id: matches.id,
      status: matches.status,
      resultWinner: matches.resultWinner,
      resultMethod: matches.resultMethod,
      resultTechnique: matches.resultTechnique,
      eventName: matches.eventName,
    })
    .from(matches)
    .where(eq(matches.tournamentOpponentId, activeOpponent.id))

  const scoutedCount = scoutedMatches.length

  const existingGameplan = await db.query.gameplans.findFirst({
    where: eq(gameplans.opponentId, activeOpponent.id),
  })

  const linkedExecution = existingGameplan
    ? await db.query.planExecutions.findFirst({
        where: eq(planExecutions.gameplanId, existingGameplan.id),
      })
    : null

  // All gameplans for this tournament — used for the outlook strip in the opponent selector
  const allGameplans = await db
    .select({ opponentId: gameplans.opponentId, prediction: gameplans.prediction })
    .from(gameplans)
    .where(eq(gameplans.tournamentId, tournamentId))

  const predictionByOpponent = Object.fromEntries(
    allGameplans
      .filter(g => g.opponentId && g.prediction)
      .map(g => [g.opponentId!, g.prediction as MatchupPrediction])
  )

  const prediction = existingGameplan?.prediction as MatchupPrediction | null ?? null

  const isGenerating = existingGameplan?.status === 'generating'
  const plan = (!isGenerating && existingGameplan?.structuredPlan && Object.keys(existingGameplan.structuredPlan as object).length > 0)
    ? existingGameplan.structuredPlan as GameplanOutput
    : null

  return (
    <div className="space-y-5">
      {isGenerating && <AutoRefresh intervalMs={5000} />}

      {/* Opponent selector */}
      {opponents.length > 1 && (
        <OpponentSelector
          opponents={opponents}
          activeId={activeOpponent.id}
          tournamentId={tournamentId}
          predictionByOpponent={predictionByOpponent}
        />
      )}

      {scoutedCount === 0 ? (
        <NoFootageState tournamentId={tournamentId} opponentLabel={activeOpponent.opponentLabel} />
      ) : isGenerating ? (
        <GeneratingState opponentLabel={activeOpponent.opponentLabel} athleteName={athleteName} />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold">
                {athleteName ? `${athleteName} vs. ${activeOpponent.opponentLabel}` : `vs. ${activeOpponent.opponentLabel}`}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} scouted
                {existingGameplan && plan ? ` · Generated ${existingGameplan.createdAt.toLocaleDateString()} (v${existingGameplan.version})` : ''}
              </p>
              {scoutedMatches.some(m => m.status === 'analysed' && m.resultWinner) && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {scoutedMatches.filter(m => m.status === 'analysed' && m.resultWinner).map(m => {
                    const isWin = m.resultWinner === 'user'
                    const label = m.resultMethod === 'submission'
                      ? (isWin ? `W — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}` : `L — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}`)
                      : m.resultMethod === 'points' ? (isWin ? 'W — Pts' : 'L — Pts')
                      : m.resultMethod === 'walkover' ? (isWin ? 'W — WO' : 'L — WO')
                      : isWin ? 'W' : 'L'
                    return (
                      <span key={m.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isWin ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30' : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
                      }`}>
                        {label}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {existingGameplan && plan && (
                <GameplanRatingWidget
                  gameplanId={existingGameplan.id}
                  initialRating={existingGameplan.rating ?? null}
                />
              )}
              {plan && <PrintButton />}
              <GenerateGameplanButton
                tournamentId={tournamentId}
                opponentId={activeOpponent.id}
                label={plan ? 'Regenerate' : 'Generate Gameplan'}
              />
            </div>
          </div>

          {prediction && <PredictionCard prediction={prediction} />}

          {plan ? (
            <>
              <GameplanDisplay plan={plan} />
              {existingGameplan && (() => {
                const reviewData = linkedExecution?.executionReview as Record<string, unknown> | undefined
                const initialDebrief = reviewData && Object.keys(reviewData).length > 0
                  ? reviewData as ExecutionDebrief
                  : null
                return (
                  <PlanExecutionSection
                    gameplanId={existingGameplan.id}
                    linkedMatchId={linkedExecution?.actualMatchId ?? null}
                    initialDebrief={initialDebrief}
                  />
                )
              })()}
            </>
          ) : (
            <ReadyToGenerateState
              tournamentId={tournamentId}
              opponentId={activeOpponent.id}
              scoutedCount={scoutedCount}
            />
          )}
        </>
      )}
    </div>
  )
}

function NoFootageState({ tournamentId, opponentLabel }: { tournamentId: string; opponentLabel: string }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center space-y-2">
      <p className="font-semibold">No footage analysed for {opponentLabel}</p>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        <Link href={`/tournaments/${tournamentId}/opponents`} className="underline hover:no-underline">
          Add scouting footage
        </Link>{' '}
        for this opponent. Once the AI analyses at least one match, you can generate a gameplan.
      </p>
    </div>
  )
}

function ReadyToGenerateState({
  tournamentId,
  opponentId,
  scoutedCount,
}: {
  tournamentId: string
  opponentId: string
  scoutedCount: number
}) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center space-y-4">
      <div className="flex items-center justify-center gap-2 mb-1">
        <span className="text-primary text-sm font-semibold">Step 3 of 3</span>
        <div className="flex items-center gap-1">
          <span className="text-primary text-lg">●</span>
          <span className="text-primary text-lg">●</span>
          <span className="text-primary text-lg">●</span>
        </div>
      </div>
      <div>
        <h3 className="font-semibold text-lg mb-1">Ready to build your gameplan</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          AI has analysed {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} of scouting footage.
          Click below to generate a tailored gameplan — takes about 30 seconds.
        </p>
      </div>
      <GenerateGameplanButton tournamentId={tournamentId} opponentId={opponentId} />
    </div>
  )
}

function GeneratingState({ opponentLabel, athleteName }: { opponentLabel: string; athleteName: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">
            {athleteName ? `${athleteName} vs. ${opponentLabel}` : `vs. ${opponentLabel}`}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <p className="text-xs text-muted-foreground">AI is building your gameplan…</p>
          </div>
        </div>
      </div>

      {/* Skeleton cards that pulse while generating */}
      <div className="rounded-xl border bg-card p-4 space-y-3 animate-pulse">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </div>

      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        <div className="rounded-xl border bg-card p-4 space-y-2 animate-pulse">
          <div className="h-4 w-1/2 rounded bg-muted" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-5/6 rounded bg-muted" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-muted animate-pulse" />
        <div className="rounded-xl border bg-card overflow-hidden animate-pulse">
          <div className="px-4 pt-4 pb-3 border-b border-border/60">
            <div className="h-4 w-40 rounded bg-muted" />
          </div>
          <div className="px-4 py-3 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 items-start">
                <div className="w-5 h-5 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 h-3 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-2 animate-pulse">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}

function GameplanDisplay({ plan }: { plan: GameplanOutput }) {
  return (
    <div className="space-y-3">
      {/* Row 1: Attack + Danger side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Attack card */}
        <div className="rounded-xl border bg-card p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">⚔</span>
            <p className="text-xs font-bold uppercase tracking-widest text-foreground">Attack</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-foreground text-background leading-none tracking-wide ml-auto">AI</span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug">{plan.primary_chain.label}</p>
          <ol className="space-y-1.5">
            {plan.primary_chain.steps.slice(0, 3).map((step, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span className="w-4 h-4 rounded-full bg-foreground text-background text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Danger card */}
        <div className="rounded-xl border bg-card p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">⚠</span>
            <p className="text-xs font-bold uppercase tracking-widest text-rose-400">Danger</p>
          </div>
          <div className="space-y-2">
            {plan.defensive_priorities.slice(0, 2).map((d, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="w-1 self-stretch rounded-full bg-rose-500/50 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground leading-snug">{d.threat}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{d.counter}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Opening / Start here */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Start Here</p>
        <p className="text-sm font-semibold leading-snug">{plan.opening.recommendation}</p>
        {plan.opening.if_scrambled && (
          <div className="flex gap-2 items-start pt-1.5 border-t border-border/40">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mt-0.5 flex-shrink-0 whitespace-nowrap">If scrambled</span>
            <p className="text-xs text-muted-foreground leading-relaxed">{plan.opening.if_scrambled}</p>
          </div>
        )}
      </div>

      {/* Mat-side cues */}
      {plan.mental_cues.length > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">🧠 Mat Cues</p>
          <div className="flex flex-wrap gap-2">
            {plan.mental_cues.map((cue, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted font-medium">
                {cue}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rules reminder */}
      {plan.format_notes && (
        <div className="rounded-xl border bg-card p-3 flex gap-2 items-start">
          <span className="text-base leading-none shrink-0">📋</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ruleset</p>
            <p className="text-xs text-foreground mt-0.5 leading-relaxed">{plan.format_notes}</p>
          </div>
        </div>
      )}

      {/* Secondary options */}
      {plan.secondary_options.length > 0 && (
        <Section title="Backup Plans">
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.secondary_options.map((opt, i) => (
              <div key={i} className="rounded-xl border bg-card p-3 space-y-1">
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{opt.rationale}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Opponent intel — below the fold */}
      <Section title="Opponent Intel">
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-400/80">Their Weapon</p>
              <p className="text-xs leading-relaxed">{plan.opponent_intel.biggest_threat}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/80">Their Gap</p>
              <p className="text-xs leading-relaxed">{plan.opponent_intel.biggest_weakness}</p>
            </div>
          </div>
          {plan.opponent_intel.patterns.length > 0 && (
            <div className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Patterns</p>
              {plan.opponent_intel.patterns.map((p, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0 mt-1.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-0.5">{title}</h3>
      {children}
    </div>
  )
}

const VERDICT_STYLES: Record<string, { bar: string; label: string; text: string }> = {
  favourable: { bar: 'bg-emerald-500', label: 'Favourable', text: 'text-emerald-400' },
  neutral:    { bar: 'bg-amber-500',   label: 'Neutral',    text: 'text-amber-400' },
  tough:      { bar: 'bg-rose-500',    label: 'Tough draw', text: 'text-rose-400' },
}

const CONFIDENCE_LABEL: Record<string, string> = {
  low: 'Low confidence — limited match data',
  medium: 'Medium confidence',
  high: 'High confidence',
}

function PredictionCard({ prediction }: { prediction: MatchupPrediction }) {
  const style = VERDICT_STYLES[prediction.verdict] ?? VERDICT_STYLES.neutral

  return (
    <Section title="Matchup Prediction">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* Win probability bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={`text-2xl font-bold tabular-nums ${style.text}`}>
              {prediction.win_probability}%
            </span>
            <div className="text-right">
              <p className={`text-sm font-semibold ${style.text}`}>{style.label}</p>
              <p className="text-xs text-muted-foreground/70">{CONFIDENCE_LABEL[prediction.confidence]}</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${style.bar}`}
              style={{ width: `${prediction.win_probability}%` }}
            />
          </div>
        </div>

        {/* Rationale */}
        <p className="text-sm text-muted-foreground leading-relaxed">{prediction.rationale}</p>

        {/* Advantages + Risks */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/80">Your Edge</p>
            {prediction.key_advantages.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="w-1 h-1 rounded-full bg-emerald-500/60 flex-shrink-0 mt-1.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-400/80">Watch Out</p>
            {prediction.key_risks.map((r, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="w-1 h-1 rounded-full bg-rose-500/60 flex-shrink-0 mt-1.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">{r}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/40">AI prediction · based on analysed match data</p>
      </div>
    </Section>
  )
}
