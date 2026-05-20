import { getOrCreateDbUserId } from '@/lib/db/get-user'
import { getUserUsageStats, FREE_MONTHLY_MATCH_LIMIT } from '@/lib/db/usage'

export const dynamic = 'force-dynamic'

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

  const planLabel: Record<string, string> = {
    free: 'Free',
    athlete: 'Athlete',
    athlete_plus: 'Athlete+',
    coach: 'Coach',
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold">My Usage</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {planLabel[stats.planTier] ?? stats.planTier} plan
        </p>
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
              <p className="text-xs text-rose-400">Monthly limit reached. Upgrade to continue analysing matches.</p>
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

      {/* This month */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">This month</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Matches analysed" value={String(stats.matchesThisMonth)} />
          <StatCard label="Video analysed" value={fmtMinutes(stats.videoMinutesThisMonth)} />
          <StatCard label="Opponents scouted" value={String(stats.opponentsScoutedThisMonth)} />
          <StatCard label="Gameplans built" value={String(stats.gameplansThisMonth)} />
          <StatCard label="AI cost" value={stats.aiCostThisMonth < 0.01 ? '<$0.01' : `$${stats.aiCostThisMonth.toFixed(2)}`} sub="your share of compute" />
        </div>
      </div>

      {/* All-time */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">All time</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Matches analysed" value={String(stats.matchesAllTime)} />
          <StatCard label="Video analysed" value={fmtMinutes(stats.videoMinutesAllTime)} />
          <StatCard label="Opponents scouted" value={String(stats.opponentsScoutedAllTime)} />
          <StatCard label="Gameplans built" value={String(stats.gameplansAllTime)} />
          <StatCard label="AI cost" value={stats.aiCostAllTime < 0.01 ? '<$0.01' : `$${stats.aiCostAllTime.toFixed(2)}`} sub="your share of compute" />
        </div>
      </div>
    </div>
  )
}
