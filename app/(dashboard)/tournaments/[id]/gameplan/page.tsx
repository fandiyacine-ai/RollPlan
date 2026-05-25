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
  searchParams: Promise<{ opponent?: string; back?: string }>
}) {
  const { id: tournamentId } = await params
  const { opponent: selectedOpponentId, back: backHref } = await searchParams

  const clerkUser = await currentUser().catch(() => null)
  const athleteName = clerkUser?.firstName ?? clerkUser?.username ?? null

  const opponents = await db
    .select()
    .from(tournamentOpponents)
    .where(eq(tournamentOpponents.tournamentId, tournamentId))

  const athleteFullName = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ').toLowerCase()
  const filtered = athleteFullName
    ? opponents.filter(o => !o.opponentLabel.toLowerCase().includes(athleteFullName))
    : opponents
  const selectorOpponents = filtered.length > 0 ? filtered : opponents

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
    ? (selectorOpponents.find(o => o.id === selectedOpponentId) ?? selectorOpponents[0])
    : selectorOpponents[0]

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
  // Show the existing committed plan even while regenerating — if Inngest drops the job the
  // UI doesn't lock up, and users can still read their gameplan while the update runs.
  const plan = (existingGameplan?.structuredPlan && Object.keys(existingGameplan.structuredPlan as object).length > 0)
    ? existingGameplan.structuredPlan as GameplanOutput
    : null

  return (
    <div className="space-y-5">
      {isGenerating && <AutoRefresh intervalMs={5000} />}

      {/* Back to My Gameplans — when navigating from /gameplans */}
      {backHref === '/gameplans' && (
        <Link href="/gameplans" className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
          ← My Gameplans
        </Link>
      )}

      {/* Opponent selector */}
      {selectorOpponents.length > 1 && (
        <OpponentSelector
          opponents={selectorOpponents}
          activeId={activeOpponent.id}
          tournamentId={tournamentId}
          predictionByOpponent={predictionByOpponent}
        />
      )}

      {scoutedCount === 0 ? (
        <NoFootageState tournamentId={tournamentId} opponentLabel={activeOpponent.opponentLabel} />
      ) : isGenerating && !plan ? (
        // First-time generation only — no prior plan to fall back on, show skeleton.
        // Re-generation shows the existing plan with a "Regenerating…" badge instead,
        // so a stuck Inngest job never locks the UI.
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
                {isGenerating && plan && (
                  <span className="flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-400 border border-amber-800/30">
                    <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Regenerating…
                  </span>
                )}
                <p className="text-xs text-muted-foreground">
                  {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} scouted
                  {existingGameplan && plan && !isGenerating ? ` · v${existingGameplan.version} · ${existingGameplan.createdAt.toLocaleDateString()}` : ''}
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
              <GameplanDisplay
                plan={plan}
                drillRefs={(existingGameplan?.evidence as { drill_refs?: DrillRef[] } | null)?.drill_refs}
              />
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

function MatchCard({ card }: { card: GameplanOutput['match_card'] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
        <p className="text-xs font-medium text-muted-foreground">Match day</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Headline */}
        <p className="text-base font-semibold leading-snug">{card.headline}</p>

        {/* Attack chain — arrows between steps */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">Attack</p>
          {/* Mobile: vertical */}
          <div className="flex flex-col gap-1 sm:hidden">
            {card.attack_chain.map((step, i) => (
              <div key={i} className="flex gap-2 items-center">
                {i > 0 && <svg className="w-3 h-3 text-muted-foreground/25 flex-shrink-0 -rotate-90" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>}
                {i === 0 && <div className="w-3 flex-shrink-0" />}
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-foreground/[0.06] border border-border/40">{step}</span>
              </div>
            ))}
          </div>
          {/* Desktop: horizontal */}
          <div className="hidden sm:flex flex-wrap items-center gap-1.5">
            {card.attack_chain.map((step, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-foreground/[0.06] border border-border/40">{step}</span>
                {i < arr.length - 1 && (
                  <svg className="w-3 h-3 text-muted-foreground/25 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 6h8M7 3l3 3-3 3"/></svg>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Open with + Watch out — 2 col */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">Open with</p>
            <p className="text-xs font-semibold leading-snug">{card.open_with}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-rose-500/70 uppercase tracking-widest">Watch out</p>
            <p className="text-xs font-semibold leading-snug text-rose-400">{card.watch_out}</p>
          </div>
        </div>

        {/* If losing */}
        {card.if_losing_points && (
          <div className="flex gap-2.5 items-center pt-3 border-t border-border/40">
            <span className="text-[10px] font-medium text-muted-foreground/50 whitespace-nowrap flex-shrink-0">If losing</span>
            <p className="text-xs font-medium text-foreground/70 leading-snug">{card.if_losing_points}</p>
          </div>
        )}
      </div>
    </div>
  )
}

type DrillRef = { id: string; name: string; eventId: string; positionId: string | null; sourceUrl: string; sourceLabel: string }

function toTitleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const YT_ICON = (
  <svg className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
)

function DrillLibrary({ drillRefs }: { drillRefs: DrillRef[] }) {
  if (drillRefs.length === 0) return null

  // Group: submission (eventId) → variant (name) → links
  const bySubmission = new Map<string, Map<string, DrillRef[]>>()
  for (const ref of drillRefs) {
    if (!bySubmission.has(ref.eventId)) bySubmission.set(ref.eventId, new Map())
    const byVariant = bySubmission.get(ref.eventId)!
    if (!byVariant.has(ref.name)) byVariant.set(ref.name, [])
    byVariant.get(ref.name)!.push(ref)
  }

  return (
    <Section title="Drill Library" mobileCollapsed>
      <div className="space-y-3">
        {Array.from(bySubmission.entries()).map(([eventId, byVariant]) => (
          <div key={eventId} className="rounded-xl border border-border/60 bg-card overflow-hidden">
            {/* Submission header */}
            <div className="px-4 py-2.5 border-b border-border/60 bg-muted/30">
              <p className="text-xs font-bold uppercase tracking-wider text-foreground/80">{toTitleCase(eventId)}</p>
            </div>

            {/* Variants */}
            <div className="divide-y divide-border/30">
              {Array.from(byVariant.entries()).map(([variantName, links]) => (
                <div key={variantName} className="px-4 py-3">
                  {/* Variant label */}
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2">{variantName}</p>
                  {/* Links */}
                  <div className="space-y-1.5">
                    {links.map((ref, li) => {
                      // sourceLabel may be a search query or an instructor name
                      // Show instructor name if it differs from the variant name, otherwise generic label
                      const labelNorm = ref.sourceLabel?.toLowerCase().replace(/\s+/g, ' ').trim()
                      const variantNorm = variantName.toLowerCase().replace(/\s+/g, ' ').trim()
                      const displayLabel = ref.sourceLabel && labelNorm !== variantNorm
                        ? ref.sourceLabel
                        : `Watch tutorial ${li + 1 > 1 ? `#${li + 1}` : ''}`.trim()
                      return (
                        <a
                          key={ref.id}
                          href={ref.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 group"
                        >
                          {YT_ICON}
                          <span className="text-xs text-foreground/70 group-hover:text-foreground transition-colors truncate">
                            {displayLabel}
                          </span>
                          <svg className="w-2.5 h-2.5 text-muted-foreground/25 flex-shrink-0 group-hover:text-muted-foreground/60 transition-colors ml-auto" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 10L10 2M5 2h5v5" />
                          </svg>
                        </a>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

function GameplanDisplay({ plan, drillRefs }: { plan: GameplanOutput; drillRefs?: DrillRef[] }) {
  return (
    <div className="space-y-3">
      {/* Match-day card — only on gameplans generated with v2+ prompt */}
      {plan.match_card && <MatchCard card={plan.match_card} />}

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
        <CollapsibleCard title="Ruleset">
          <div className="p-4 flex gap-3 items-start">
            <div className="w-1 self-stretch rounded-full bg-amber-500/40 flex-shrink-0" />
            <p className="text-xs text-foreground leading-relaxed">{plan.format_notes}</p>
          </div>
        </CollapsibleCard>
      )}

      {/* Backup Plans */}
      {plan.secondary_options.length > 0 && (
        <Section title="Backup Plans" mobileCollapsed>
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
      <Section title="Opponent Intel" mobileCollapsed>
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

      {/* Drill Library */}
      {drillRefs && <DrillLibrary drillRefs={drillRefs} />}
    </div>
  )
}

const CHEVRON = (
  <svg className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4l4 4 4-4"/></svg>
)

// Wraps an inline card (border + bg-card) to make it collapsible on mobile
function CollapsibleCard({ title, titleColor = 'text-muted-foreground', children }: {
  title: string
  titleColor?: string
  children: React.ReactNode
}) {
  return (
    <>
      {/* Desktop: always open */}
      <div className="hidden sm:block rounded-xl border border-border/60 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60">
          <p className={`text-xs font-medium ${titleColor}`}>{title}</p>
        </div>
        {children}
      </div>
      {/* Mobile: collapsible */}
      <details className="sm:hidden rounded-xl border border-border/60 bg-card overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center justify-between px-5 py-3 border-b border-border/60 select-none [&::-webkit-details-marker]:hidden">
          <p className={`text-xs font-medium ${titleColor}`}>{title}</p>
          {CHEVRON}
        </summary>
        {children}
      </details>
    </>
  )
}

function Section({ title, children, mobileCollapsed = false }: { title: string; children: React.ReactNode; mobileCollapsed?: boolean }) {
  if (!mobileCollapsed) {
    return (
      <div className="space-y-2.5">
        <h3 className="text-xs font-medium text-muted-foreground px-0.5">{title}</h3>
        {children}
      </div>
    )
  }
  return (
    <>
      {/* Desktop: always open */}
      <div className="hidden sm:block space-y-2.5">
        <h3 className="text-xs font-medium text-muted-foreground px-0.5">{title}</h3>
        {children}
      </div>
      {/* Mobile: collapsible via native <details> */}
      <details className="sm:hidden">
        <summary className="list-none cursor-pointer flex items-center justify-between px-0.5 py-1 select-none [&::-webkit-details-marker]:hidden">
          <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
          {CHEVRON}
        </summary>
        <div className="mt-2 space-y-2.5">{children}</div>
      </details>
    </>
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
    <Section title="Matchup Prediction" mobileCollapsed>
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
