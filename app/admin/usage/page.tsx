import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { users, matches, videos, gameplans, tournaments, aiCallLogs } from '@/lib/db/schema'
import { eq, sql, desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

function fmtMinutes(mins: number): string {
  if (mins < 1) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export default async function AdminUsagePage() {
  const { userId: clerkId } = await auth()
  const adminId = process.env.ADMIN_CLERK_USER_ID
  if (!adminId || clerkId !== adminId) return notFound()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Per-user match + video stats
  const matchRows = await db
    .select({
      userId: matches.userId,
      matchesAllTime: sql<number>`count(*)`,
      matchesThisMonth: sql<number>`count(*) filter (where ${matches.createdAt} >= ${startOfMonth})`,
      videoMinutesAllTime: sql<number>`coalesce(sum(${videos.durationSeconds}), 0) / 60`,
      videoMinutesThisMonth: sql<number>`coalesce(sum(${videos.durationSeconds}) filter (where ${matches.createdAt} >= ${startOfMonth}), 0) / 60`,
      lastMatch: sql<string>`max(${matches.createdAt})`,
    })
    .from(matches)
    .leftJoin(videos, eq(videos.id, matches.videoId))
    .where(eq(matches.status, 'analysed'))
    .groupBy(matches.userId)

  // Per-user AI cost from logs (attributed records only)
  const costRows = await db
    .select({
      userId: aiCallLogs.userId,
      totalCost: sql<number>`coalesce(sum(${aiCallLogs.costUsdEstimate}), 0)`,
      costThisMonth: sql<number>`coalesce(sum(${aiCallLogs.costUsdEstimate}) filter (where ${aiCallLogs.createdAt} >= ${startOfMonth}), 0)`,
    })
    .from(aiCallLogs)
    .groupBy(aiCallLogs.userId)

  // True platform-wide cost — includes all records regardless of userId attribution
  const [platformCost] = await db
    .select({
      allTime: sql<number>`coalesce(sum(${aiCallLogs.costUsdEstimate}), 0)`,
      thisMonth: sql<number>`coalesce(sum(${aiCallLogs.costUsdEstimate}) filter (where ${aiCallLogs.createdAt} >= ${startOfMonth}), 0)`,
    })
    .from(aiCallLogs)

  // Per-user gameplan counts (through tournaments)
  const gameplanRows = await db
    .select({
      userId: tournaments.userId,
      gameplansAllTime: sql<number>`count(*)`,
    })
    .from(gameplans)
    .innerJoin(tournaments, eq(tournaments.id, gameplans.tournamentId))
    .groupBy(tournaments.userId)

  // All users
  const allUsers = await db
    .select({ id: users.id, email: users.email, planTier: users.planTier, createdAt: users.createdAt })
    .from(users)
    .orderBy(desc(users.createdAt))

  const matchMap = new Map(matchRows.map(r => [r.userId, r]))
  const costMap = new Map(costRows.map(r => [r.userId, r]))
  const gameplanMap = new Map(gameplanRows.map(r => [r.userId, r]))

  const rows = allUsers.map(u => ({
    ...u,
    matchesThisMonth: Number(matchMap.get(u.id)?.matchesThisMonth ?? 0),
    matchesAllTime: Number(matchMap.get(u.id)?.matchesAllTime ?? 0),
    videoMinutesAllTime: Number(matchMap.get(u.id)?.videoMinutesAllTime ?? 0),
    gameplansAllTime: Number(gameplanMap.get(u.id)?.gameplansAllTime ?? 0),
    costAllTime: Number(costMap.get(u.id)?.totalCost ?? 0),
    costThisMonth: Number(costMap.get(u.id)?.costThisMonth ?? 0),
    lastActive: matchMap.get(u.id)?.lastMatch ?? null,
  })).sort((a, b) => b.matchesThisMonth - a.matchesThisMonth || b.matchesAllTime - a.matchesAllTime)

  const totals = {
    matchesThisMonth: rows.reduce((s, r) => s + r.matchesThisMonth, 0),
    matchesAllTime: rows.reduce((s, r) => s + r.matchesAllTime, 0),
    videoMinutesAllTime: rows.reduce((s, r) => s + r.videoMinutesAllTime, 0),
    // Use unfiltered platform totals so NULL-userId historical records are included
    costThisMonth: Number(platformCost?.thisMonth ?? 0),
    costAllTime: Number(platformCost?.allTime ?? 0),
  }

  const planBadge: Record<string, string> = {
    free: 'bg-zinc-800 text-zinc-400',
    athlete: 'bg-blue-950/60 text-blue-400',
    athlete_plus: 'bg-purple-950/60 text-purple-400',
    coach: 'bg-amber-950/60 text-amber-400',
  }

  return (
    <div className="min-h-screen bg-background p-8 space-y-8">
      <div>
        <h1 className="text-xl font-bold">Admin — Usage</h1>
        <p className="text-sm text-muted-foreground mt-1">{allUsers.length} users · {new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Users', value: String(allUsers.length) },
          { label: 'Analyses this month', value: String(totals.matchesThisMonth) },
          { label: 'Analyses all-time', value: String(totals.matchesAllTime) },
          { label: 'AI cost this month', value: fmtCost(totals.costThisMonth) },
          { label: 'AI cost all-time', value: fmtCost(totals.costAllTime) },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border/60 rounded-xl p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-xl font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Per-user table */}
      <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 bg-muted/30">
            <tr>
              {['User', 'Plan', 'Analyses /mo', 'Analyses total', 'Video total', 'Gameplans', 'AI cost /mo', 'AI cost total', 'Last active'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 text-xs font-medium max-w-[180px] truncate">{r.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${planBadge[r.planTier] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {r.planTier}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{r.matchesThisMonth || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{r.matchesAllTime || '—'}</td>
                <td className="px-4 py-3 tabular-nums">{fmtMinutes(r.videoMinutesAllTime)}</td>
                <td className="px-4 py-3 tabular-nums">{r.gameplansAllTime || '—'}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.costThisMonth > 0 ? fmtCost(r.costThisMonth) : '—'}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.costAllTime > 0 ? fmtCost(r.costAllTime) : '—'}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.lastActive ? new Date(r.lastActive).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        AI costs shown only for calls with user attribution. Costs may be underreported for older records.
      </p>
    </div>
  )
}
