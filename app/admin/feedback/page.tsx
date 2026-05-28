import { auth } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { feedback, users } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

const CATEGORY_BADGE: Record<string, string> = {
  bug: 'bg-red-950/60 text-red-400',
  feature: 'bg-blue-950/60 text-blue-400',
  praise: 'bg-green-950/60 text-green-400',
  other: 'bg-zinc-800 text-zinc-400',
}

const RATING_COLOUR: Record<number, string> = {
  1: 'text-red-400',
  2: 'text-orange-400',
  3: 'text-yellow-400',
  4: 'text-green-400',
  5: 'text-emerald-400',
}

export default async function AdminFeedbackPage() {
  const { userId: clerkId } = await auth()
  const adminId = process.env.ADMIN_CLERK_USER_ID
  if (!adminId || clerkId !== adminId) return notFound()

  const rows = await db
    .select({
      id: feedback.id,
      rating: feedback.rating,
      category: feedback.category,
      message: feedback.message,
      page: feedback.page,
      createdAt: feedback.createdAt,
      userEmail: users.email,
    })
    .from(feedback)
    .leftJoin(users, eq(users.id, feedback.userId))
    .orderBy(desc(feedback.createdAt))

  return (
    <div className="min-h-screen bg-background p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Admin — Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">{rows.length} submission{rows.length !== 1 ? 's' : ''}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr>
                {['Date', 'User', 'Category', 'Rating', 'Page', 'Message'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-muted/20 align-top">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium max-w-[180px] truncate">
                    {r.userEmail ?? <span className="text-muted-foreground">anonymous</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.category ? (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${CATEGORY_BADGE[r.category] ?? 'bg-zinc-800 text-zinc-400'}`}>
                        {r.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.rating != null ? (
                      <span className={`font-bold ${RATING_COLOUR[r.rating] ?? ''}`}>{r.rating}/5</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">
                    {r.page ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-xs whitespace-pre-wrap break-words">
                    {r.message ?? <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
