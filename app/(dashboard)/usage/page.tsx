import Link from 'next/link'
import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { getUserUsageStats } from '@/lib/db/usage'
import { getSubscriptionStatus } from '@/lib/subscription'

export const dynamic = 'force-dynamic'

const PLAN_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: 'Free plan', className: 'bg-muted text-muted-foreground' },
  trial: { label: 'Pro trial', className: 'bg-violet-500/15 text-violet-400' },
  pro: { label: 'Pro', className: 'bg-blue-500/15 text-blue-400' },
}

const PRO_PERKS = [
  'Unlimited video analysis',
  'Unlimited opponent scouting',
  'Unlimited tournaments',
  'Everything in Free, no monthly cap',
]

function UpgradePromo() {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold">Go Pro — train smarter, win more</p>
        <p className="text-xs text-muted-foreground mt-0.5">14-day free trial, then €5/mo. Cancel anytime.</p>
      </div>
      <ul className="space-y-2">
        {PRO_PERKS.map(perk => (
          <li key={perk} className="flex items-start gap-2.5 text-xs text-muted-foreground">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 mt-0.5 flex-shrink-0">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {perk}
          </li>
        ))}
      </ul>
      <Link
        href="/upgrade"
        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background text-xs font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
      >
        Start free trial →
      </Link>
    </div>
  )
}

function fmtMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-5 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default async function UsagePage() {
  const userId = await getOrCreateDbUserId()
  let stats: Awaited<ReturnType<typeof getUserUsageStats>>
  try {
    stats = await getUserUsageStats(userId)
  } catch (err) {
    console.error('[/usage] getUserUsageStats failed:', err)
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-lg font-semibold">My Usage</h1>
        <p className="text-sm text-rose-400">Failed to load usage data. Please try again later.</p>
        <pre className="text-xs text-muted-foreground bg-card p-4 rounded-lg overflow-auto whitespace-pre-wrap">{String(err)}</pre>
      </div>
    )
  }

  const pct = isFinite(stats.monthlyLimit)
    ? Math.min(100, (stats.matchesThisMonth / stats.monthlyLimit) * 100)
    : null
  const barColor = pct === null
    ? 'bg-foreground/30'
    : pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-primary'

  const badge = PLAN_BADGE[stats.tier]

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-2.5">
        <h1 className="text-lg font-semibold">My Usage</h1>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Monthly limit */}
      <div className="bg-card border border-border/60 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Matches analysed this month</p>
          <span className="text-sm font-bold tabular-nums">
            {stats.matchesThisMonth}
            {isFinite(stats.monthlyLimit) && (
              <span className="text-muted-foreground font-normal">/{stats.monthlyLimit}</span>
            )}
          </span>
        </div>
        {pct !== null ? (
          <>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
            {pct >= 100 ? (
              <p className="text-xs text-rose-400">You've used all {stats.monthlyLimit} free analyses — upgrade for unlimited.</p>
            ) : pct >= 80 ? (
              <p className="text-xs text-amber-400">
                {stats.monthlyLimit - stats.matchesThisMonth} analyse{stats.monthlyLimit - stats.matchesThisMonth !== 1 ? 's' : ''} remaining this month.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {stats.monthlyLimit - stats.matchesThisMonth} of {stats.monthlyLimit} free analyses remaining this month.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Unlimited analyses on your plan.</p>
        )}
      </div>

      {stats.tier === 'free' && <UpgradePromo />}

      {/* This month */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">This month</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Matches analysed" value={String(stats.matchesThisMonth)} />
          <StatCard label="Video analysed" value={fmtMinutes(stats.videoMinutesThisMonth)} />
          <StatCard label="Opponents scouted" value={String(stats.opponentsScoutedThisMonth)} />
          <StatCard label="Gameplans built" value={String(stats.gameplansThisMonth)} />
        </div>
      </div>

      {/* All-time */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">All time</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Matches analysed" value={String(stats.matchesAllTime)} />
          <StatCard label="Video analysed" value={fmtMinutes(stats.videoMinutesAllTime)} />
          <StatCard label="Opponents scouted" value={String(stats.opponentsScoutedAllTime)} />
          <StatCard label="Gameplans built" value={String(stats.gameplansAllTime)} />
        </div>
      </div>
    </div>
  )
}
