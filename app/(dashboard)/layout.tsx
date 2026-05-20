import { Suspense } from 'react'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { Nav } from './nav'
import { getOrCreateDbUserId } from '../../lib/db/get-user'
import { checkMonthlyLimit } from '../../lib/db/usage'

async function UsagePill() {
  try {
    const userId = await getOrCreateDbUserId()
    const { used, limit } = await checkMonthlyLimit(userId)
    if (!isFinite(limit)) return null  // paid plan — no usage pill
    const pct = Math.min(100, (used / limit) * 100)
    const barColor = used >= limit ? 'bg-rose-500' : used >= Math.floor(limit * 0.8) ? 'bg-amber-500' : 'bg-foreground/40'
    return (
      <Link href="/usage" className="flex flex-col items-end gap-1 group" title="My usage">
        <span className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground leading-none tabular-nums transition-colors">{used}/{limit} analyses</span>
        <div className="w-14 h-1 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </Link>
    )
  } catch {
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkId } = await auth()
  const isAdmin = !!process.env.ADMIN_CLERK_USER_ID && clerkId === process.env.ADMIN_CLERK_USER_ID

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav usageSlot={<Suspense fallback={null}><UsagePill /></Suspense>} />
      <main className="p-6 flex-1">{children}</main>
      <footer className="px-6 py-4 border-t border-border/40 flex items-center justify-center gap-6 text-xs text-muted-foreground/60">
        <Link href="/faq" className="hover:text-muted-foreground transition-colors">FAQ</Link>
        <Link href="/contact" className="hover:text-muted-foreground transition-colors">Contact</Link>
        {isAdmin && (
          <Link href="/admin/usage" className="hover:text-muted-foreground transition-colors">Admin ↗</Link>
        )}
      </footer>
    </div>
  )
}
