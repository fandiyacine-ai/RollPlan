import { db } from '../../../../../lib/db'
import { gameplans, tournamentOpponents, matches } from '../../../../../lib/db/schema'
import { eq, count } from 'drizzle-orm'
import Link from 'next/link'
import { GenerateGameplanButton } from './generate-button'
import { PrintButton } from './print-button'
import { GameplanRatingWidget } from './rating-widget'
import { AutoRefresh } from './auto-refresh'
import type { GameplanOutput } from '../../../../../lib/ai/schemas/gameplan'

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

  const [scoutedResult] = await db
    .select({ count: count() })
    .from(matches)
    .where(eq(matches.tournamentOpponentId, activeOpponent.id))

  const scoutedCount = scoutedResult?.count ?? 0

  const existingGameplan = await db.query.gameplans.findFirst({
    where: eq(gameplans.opponentId, activeOpponent.id),
  })

  const isGenerating = existingGameplan?.status === 'generating'
  const plan = (!isGenerating && existingGameplan?.structuredPlan && Object.keys(existingGameplan.structuredPlan as object).length > 0)
    ? existingGameplan.structuredPlan as GameplanOutput
    : null

  return (
    <div className="space-y-5">
      {isGenerating && <AutoRefresh intervalMs={5000} />}

      {/* Opponent selector */}
      {opponents.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {opponents.map(opp => (
            <Link
              key={opp.id}
              href={`/tournaments/${tournamentId}/gameplan?opponent=${opp.id}`}
              className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
                opp.id === activeOpponent.id
                  ? 'bg-foreground text-background border-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              {opp.opponentLabel}
            </Link>
          ))}
        </div>
      )}

      {scoutedCount === 0 ? (
        <NoFootageState tournamentId={tournamentId} opponentLabel={activeOpponent.opponentLabel} />
      ) : isGenerating ? (
        <GeneratingState opponentLabel={activeOpponent.opponentLabel} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold truncate">vs. {activeOpponent.opponentLabel}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} scouted
                {existingGameplan && plan ? ` · Generated ${existingGameplan.createdAt.toLocaleDateString()} (v${existingGameplan.version})` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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
            <GameplanDisplay plan={plan} />
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

function GeneratingState({ opponentLabel }: { opponentLabel: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">vs. {opponentLabel}</h2>
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
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-xl border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Overview</p>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-foreground text-background leading-none tracking-wide">AI</span>
        </div>
        <p className="text-sm leading-relaxed">{plan.summary}</p>
        {plan.format_notes && (
          <p className="text-xs text-muted-foreground border-t border-border/60 pt-2 mt-1">{plan.format_notes}</p>
        )}
      </div>

      {/* Opening */}
      <Section title="Opening">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold">{plan.opening.recommendation}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{plan.opening.rationale}</p>
          {plan.opening.if_scrambled && (
            <div className="flex gap-2 items-start pt-1 border-t border-border/60">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5 flex-shrink-0">If scrambled</span>
              <p className="text-xs text-muted-foreground">{plan.opening.if_scrambled}</p>
            </div>
          )}
        </div>
      </Section>

      {/* Primary chain */}
      <Section title="Primary Attack Chain">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border/60">
            <span className="text-sm font-semibold">{plan.primary_chain.label}</span>
          </div>
          <ol className="px-4 py-3 space-y-2">
            {plan.primary_chain.steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
          <div className="px-4 pb-3">
            <p className="text-xs text-muted-foreground italic">{plan.primary_chain.rationale}</p>
          </div>
        </div>
      </Section>

      {/* Secondary options */}
      {plan.secondary_options.length > 0 && (
        <Section title="Secondary Options">
          <div className="grid gap-2 sm:grid-cols-2">
            {plan.secondary_options.map((opt, i) => (
              <div key={i} className="rounded-xl border bg-card p-3 space-y-1">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.rationale}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Defensive priorities */}
      <Section title="Watch Out For">
        <div className="space-y-2">
          {plan.defensive_priorities.map((d, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-3 flex gap-3">
              <div className="w-1 rounded-full bg-destructive/60 flex-shrink-0 self-stretch" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-semibold">{d.threat}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{d.counter}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Opponent intel */}
      <Section title="Opponent Intel">
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Their Weapon</p>
              <p className="text-sm leading-relaxed">{plan.opponent_intel.biggest_threat}</p>
            </div>
            <div className="rounded-xl border bg-card p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Their Gap</p>
              <p className="text-sm leading-relaxed">{plan.opponent_intel.biggest_weakness}</p>
            </div>
          </div>
          {plan.opponent_intel.patterns.length > 0 && (
            <div className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Patterns</p>
              {plan.opponent_intel.patterns.map((p, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0 mt-2" />
                  <p className="text-sm text-muted-foreground leading-relaxed">{p}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Mental cues */}
      {plan.mental_cues.length > 0 && (
        <Section title="Mat-Side Cues">
          <div className="flex flex-wrap gap-2">
            {plan.mental_cues.map((cue, i) => (
              <span key={i} className="text-sm px-3 py-1.5 rounded-full border border-border bg-muted font-medium">
                {cue}
              </span>
            ))}
          </div>
        </Section>
      )}
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
