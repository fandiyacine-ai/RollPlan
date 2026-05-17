import { db } from '../../../../../lib/db'
import { gameplans, tournamentOpponents, matches } from '../../../../../lib/db/schema'
import { eq, count } from 'drizzle-orm'
import Link from 'next/link'
import { GenerateGameplanButton } from './generate-button'
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
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <p className="font-medium">No opponents added yet</p>
        <p className="text-sm mt-1">
          <Link href={`/tournaments/${tournamentId}/opponents`} className="underline hover:no-underline">
            Add opponents
          </Link>{' '}
          and scout their footage before generating a gameplan.
        </p>
      </div>
    )
  }

  const activeOpponent = selectedOpponentId
    ? opponents.find(o => o.id === selectedOpponentId) ?? opponents[0]
    : opponents[0]

  // Count analysed opponent matches
  const [scoutedResult] = await db
    .select({ count: count() })
    .from(matches)
    .where(eq(matches.tournamentOpponentId, activeOpponent.id))

  const scoutedCount = scoutedResult?.count ?? 0

  // Load existing gameplan if any
  const existingGameplan = await db.query.gameplans.findFirst({
    where: eq(gameplans.opponentId, activeOpponent.id),
  })

  const plan = existingGameplan?.structuredPlan as GameplanOutput | null

  return (
    <div className="space-y-5">
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

      {/* Scouting status */}
      {scoutedCount === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="font-medium">No footage analysed for {activeOpponent.opponentLabel}</p>
          <p className="text-sm mt-1">
            <Link href={`/tournaments/${tournamentId}/opponents`} className="underline hover:no-underline">
              Submit scouting footage
            </Link>{' '}
            first, then come back to generate the gameplan.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">vs. {activeOpponent.opponentLabel}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scoutedCount} match{scoutedCount !== 1 ? 'es' : ''} scouted
                {existingGameplan ? ` · Generated ${existingGameplan.createdAt.toLocaleDateString()} (v${existingGameplan.version})` : ''}
              </p>
            </div>
            <GenerateGameplanButton tournamentId={tournamentId} opponentId={activeOpponent.id} />
          </div>

          {plan ? (
            <GameplanDisplay plan={plan} />
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <p className="text-sm">Click "Generate Gameplan" to build an AI-powered gameplan for this matchup.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function GameplanDisplay({ plan }: { plan: GameplanOutput }) {
  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="rounded-lg bg-muted/40 border p-4 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Overview</p>
        <p className="text-sm">{plan.summary}</p>
        {plan.format_notes && (
          <p className="text-xs text-muted-foreground mt-1 italic">{plan.format_notes}</p>
        )}
      </div>

      {/* Opening */}
      <Section title="Opening Strategy">
        <div className="space-y-1">
          <p className="text-sm font-medium">{plan.opening.recommendation}</p>
          <p className="text-sm text-muted-foreground">{plan.opening.rationale}</p>
          {plan.opening.if_scrambled && (
            <p className="text-xs text-muted-foreground italic mt-1">
              If scrambled: {plan.opening.if_scrambled}
            </p>
          )}
        </div>
      </Section>

      {/* Primary chain */}
      <Section title="Primary Attack Chain">
        <div className="space-y-2">
          <p className="text-sm font-semibold">{plan.primary_chain.label}</p>
          <ol className="space-y-1 ml-4">
            {plan.primary_chain.steps.map((step, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground font-mono w-4 flex-shrink-0">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground italic">{plan.primary_chain.rationale}</p>
        </div>
      </Section>

      {/* Secondary options */}
      {plan.secondary_options.length > 0 && (
        <Section title="Secondary Options">
          <div className="space-y-3">
            {plan.secondary_options.map((opt, i) => (
              <div key={i} className="space-y-0.5">
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.rationale}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Defensive priorities */}
      <Section title="Defensive Priorities">
        <div className="space-y-2">
          {plan.defensive_priorities.map((d, i) => (
            <div key={i} className="rounded-md border border-red-100 bg-red-50 p-3 space-y-0.5">
              <p className="text-sm font-medium text-red-800">{d.threat}</p>
              <p className="text-xs text-red-700">{d.counter}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Opponent intel */}
      <Section title="Opponent Intel">
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 rounded-md bg-red-50 border border-red-100 p-3">
              <p className="text-xs font-semibold text-red-700 mb-1">Biggest Threat</p>
              <p className="text-sm">{plan.opponent_intel.biggest_threat}</p>
            </div>
            <div className="flex-1 rounded-md bg-green-50 border border-green-100 p-3">
              <p className="text-xs font-semibold text-green-700 mb-1">Biggest Weakness</p>
              <p className="text-sm">{plan.opponent_intel.biggest_weakness}</p>
            </div>
          </div>
          {plan.opponent_intel.patterns.length > 0 && (
            <ul className="space-y-1">
              {plan.opponent_intel.patterns.map((p, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-foreground">·</span> {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Mental cues */}
      {plan.mental_cues.length > 0 && (
        <Section title="Mental Cues">
          <div className="flex flex-wrap gap-2">
            {plan.mental_cues.map((cue, i) => (
              <span key={i} className="text-sm px-3 py-1.5 rounded-full border bg-muted font-medium">
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
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}
