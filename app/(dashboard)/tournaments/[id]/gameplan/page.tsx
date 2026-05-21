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
      <div className="rounded-xl border border-dashed border-border/50 p-10 text-center space-y-3">
        <p className="text-xs text-muted-foreground font-medium">Step 3 of 3</p>
        <p className="font-semibold text-lg">No opponents yet</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          <Link href={`/tournaments/${tournamentId}/opponents`} className="text-foreground underline underline-offset-2 hover:no-underline">
            Add opponents and scout their footage
          </Link>{' '}
          first — then come back to generate your gameplan.
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
          {/* Mobile: ultra-compact strip — opponent + generate only */}
          <div className="flex sm:hidden items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {plan && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60 border border-border/40 flex-shrink-0">AI</span>}
              <span className="text-sm font-semibold truncate">{activeOpponent.opponentLabel}</span>
              <span className="text-[10px] text-muted-foreground/50 flex-shrink-0">{scoutedCount}m</span>
            </div>
            <GenerateGameplanButton
              tournamentId={tournamentId}
              opponentId={activeOpponent.id}
              label={plan ? 'Regen' : 'Generate'}
            />
          </div>

          {/* Desktop: full matchup header */}
          <div className="hidden sm:flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium mb-1.5">Gameplan</p>
              <h2 className="text-xl font-semibold leading-snug">
                {athleteName ? `${athleteName} vs. ${activeOpponent.opponentLabel}` : `vs. ${activeOpponent.opponentLabel}`}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {plan && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/[0.06] text-foreground/60 border border-border/40">AI</span>
                )}
                <p className="text-xs text-muted-foreground">
                  {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} scouted
                  {existingGameplan && plan ? ` · v${existingGameplan.version} · ${existingGameplan.createdAt.toLocaleDateString()}` : ''}
                </p>
              </div>
              {scoutedMatches.some(m => m.status === 'analysed' && m.resultWinner) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-muted-foreground">Footage:</span>
                  {scoutedMatches.filter(m => m.status === 'analysed' && m.resultWinner).map(m => {
                    const isWin = m.resultWinner === 'user'
                    const label = m.resultMethod === 'submission'
                      ? (isWin ? `W — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}` : `L — Sub${m.resultTechnique ? ` (${m.resultTechnique})` : ''}`)
                      : m.resultMethod === 'points' ? (isWin ? 'W — Pts' : 'L — Pts')
                      : m.resultMethod === 'walkover' ? (isWin ? 'W — WO' : 'L — WO')
                      : isWin ? 'W' : 'L'
                    return (
                      <span key={m.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
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

          {plan ? (
            <>
              <GameplanDisplay plan={plan} />
              {/* Mobile: rating + print after content, not before */}
              {existingGameplan && plan && (
                <div className="flex sm:hidden items-center gap-2">
                  <GameplanRatingWidget
                    gameplanId={existingGameplan.id}
                    initialRating={existingGameplan.rating ?? null}
                  />
                  <PrintButton />
                </div>
              )}
              {prediction && <PredictionCard prediction={prediction} />}
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
    <div className="rounded-xl border border-dashed border-border/50 p-10 text-center space-y-3">
      <p className="text-xs text-muted-foreground font-medium">No footage</p>
      <p className="font-semibold text-base">{opponentLabel}</p>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
        <Link href={`/tournaments/${tournamentId}/opponents`} className="text-foreground underline underline-offset-2 hover:no-underline">
          Add scouting footage
        </Link>{' '}
        for this opponent first — then come back to generate their gameplan.
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
    <div className="rounded-xl border border-border/60 bg-card p-8 text-center space-y-5">
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-3">Step 3 of 3</p>
        <h3 className="font-semibold text-lg mb-2">Ready to build your gameplan</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} analysed — generate a tailored fight plan in ~30 seconds.
        </p>
      </div>
      <GenerateGameplanButton tournamentId={tournamentId} opponentId={opponentId} />
    </div>
  )
}

function GeneratingState({ opponentLabel, athleteName }: { opponentLabel: string; athleteName: string | null }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground font-medium mb-1.5">Gameplan</p>
        <h2 className="text-xl font-semibold leading-snug">
          {athleteName ? `${athleteName} vs. ${opponentLabel}` : `vs. ${opponentLabel}`}
        </h2>
        <div className="flex items-center gap-2 mt-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
          <p className="text-xs text-muted-foreground">Building gameplan…</p>
        </div>
      </div>

      {/* Skeleton grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3 animate-pulse">
          <div className="h-2.5 w-20 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3].map(i => <div key={i} className="h-7 w-24 rounded-lg bg-muted" />)}
          </div>
        </div>
        <div className="rounded-xl border border-rose-900/30 bg-rose-950/10 p-5 space-y-3 animate-pulse">
          <div className="h-2.5 w-16 rounded bg-rose-900/40" />
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-5/6 rounded bg-muted" />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-2.5 animate-pulse">
        <div className="h-2.5 w-20 rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </div>

      <div className="rounded-xl border border-border/60 bg-card px-5 py-3 flex gap-3 animate-pulse">
        <div className="h-2.5 w-16 rounded bg-muted" />
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-7 w-20 rounded-full bg-muted" />)}
        </div>
      </div>
    </div>
  )
}

function GameplanDisplay({ plan }: { plan: GameplanOutput }) {
  return (
    <div className="space-y-3">
      {/* Row 1: Attack chain (wider) + Danger (narrower) */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
        {/* Attack chain */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/60">
            <p className="text-xs font-medium text-muted-foreground">Attack chain</p>
          </div>
          <div className="p-5 space-y-3.5">
            <p className="text-sm font-semibold">{plan.primary_chain.label}</p>
            {/* Mobile: vertical numbered list, clamped */}
            <div className="flex flex-col gap-1.5 sm:hidden">
              {plan.primary_chain.steps.slice(0, 4).map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[10px] font-black text-muted-foreground/25 tabular-nums flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-xs font-semibold leading-snug line-clamp-2">{step}</span>
                </div>
              ))}
            </div>
            {/* Desktop: horizontal chain */}
            <div className="hidden sm:flex flex-wrap items-center gap-1.5">
              {plan.primary_chain.steps.slice(0, 4).map((step, i, arr) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-muted-foreground/25 tabular-nums">{i + 1}</span>
                    <span className="text-xs font-semibold bg-foreground/[0.06] border border-border/40 px-2.5 py-1 rounded-lg">{step}</span>
                  </span>
                  {i < arr.length - 1 && (
                    <svg className="w-3 h-3 text-muted-foreground/25 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Danger card */}
        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40">
            <p className="text-xs font-medium text-rose-500">Danger</p>
          </div>
          <div className="p-5 space-y-3.5">
            {plan.defensive_priorities.slice(0, 2).map((d, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground leading-snug">{d.threat}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{d.counter}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Start Here */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60">
          <p className="text-xs font-medium text-muted-foreground">Start here</p>
        </div>
        <div className="p-5 space-y-2">
          <p className="text-sm font-medium leading-snug">{plan.opening.recommendation}</p>
          {plan.opening.if_scrambled && (
            <div className="flex gap-2.5 items-start pt-2.5 border-t border-border/40">
              <span className="text-xs font-medium text-muted-foreground mt-0.5 flex-shrink-0 whitespace-nowrap">If scrambled</span>
              <p className="text-xs text-muted-foreground leading-relaxed">{plan.opening.if_scrambled}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mat Cues — inline horizontal */}
      {plan.mental_cues.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground flex-shrink-0">Mat cues</p>
          <div className="flex flex-wrap gap-1.5">
            {plan.mental_cues.map((cue, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-border/60 bg-foreground/[0.04] font-medium">
                {cue}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ruleset */}
      {plan.format_notes && (
        <div className="rounded-xl border border-border/60 bg-card p-4 flex gap-3 items-start">
          <div className="w-1 self-stretch rounded-full bg-amber-500/40 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-muted-foreground">Ruleset</p>
            <p className="text-xs text-foreground mt-1 leading-relaxed">{plan.format_notes}</p>
          </div>
        </div>
      )}

      {/* Backup Plans */}
      {plan.secondary_options.length > 0 && (
        <Section title="Backup Plans">
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.secondary_options.map((opt, i) => (
              <div key={i} className="rounded-xl border border-border/60 bg-card p-4 space-y-1.5">
                <p className="text-xs font-semibold">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{opt.rationale}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Opponent Intel */}
      <Section title="Opponent Intel">
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border/40 bg-card p-4 space-y-1.5">
              <p className="text-xs font-medium text-rose-500">Their weapon</p>
              <p className="text-xs leading-relaxed">{plan.opponent_intel.biggest_threat}</p>
            </div>
            <div className="rounded-xl border border-border/40 bg-card p-4 space-y-1.5">
              <p className="text-xs font-medium text-emerald-500">Their gap</p>
              <p className="text-xs leading-relaxed">{plan.opponent_intel.biggest_weakness}</p>
            </div>
          </div>
          {plan.opponent_intel.patterns.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-2.5">
              <p className="text-xs font-medium text-muted-foreground">Patterns</p>
              <div className="space-y-2">
                {plan.opponent_intel.patterns.map((p, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums flex-shrink-0 mt-0.5">{i + 1}.</span>
                    <p className="text-xs text-muted-foreground leading-relaxed">{p}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <h3 className="text-xs font-medium text-muted-foreground px-0.5">{title}</h3>
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
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* Big probability header */}
        <div className="px-5 py-5 border-b border-border/60">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Win probability</p>
              <span className="text-3xl font-bold tabular-nums leading-none">
                {prediction.win_probability}%
              </span>
            </div>
            <div className="text-right pb-1">
              <p className={`text-sm font-semibold ${style.text}`}>{style.label}</p>
              <p className="text-xs text-muted-foreground/50 mt-1">{CONFIDENCE_LABEL[prediction.confidence]}</p>
            </div>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden mt-4">
            <div className="h-full rounded-full bg-foreground/30 transition-all" style={{ width: `${prediction.win_probability}%` }} />
          </div>
        </div>

        {/* Rationale */}
        <div className="px-5 py-4 border-b border-border/60">
          <p className="text-sm text-muted-foreground leading-relaxed">{prediction.rationale}</p>
        </div>

        {/* Advantages + Risks */}
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-medium text-emerald-500">Your edge</p>
            {prediction.key_advantages.map((a, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed">{a}</p>
            ))}
          </div>
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-medium text-rose-500">Watch out</p>
            {prediction.key_risks.map((r, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed">{r}</p>
            ))}
          </div>
        </div>

        <div className="px-5 py-2.5 border-t border-border/60">
          <p className="text-[10px] text-muted-foreground/30">AI prediction · based on analysed match data</p>
        </div>
      </div>
    </Section>
  )
}
