import { Suspense } from 'react'
import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { Nav } from './nav'
import { getOrCreateDbUserId } from '../../lib/db/get-user'
import { checkMonthlyLimit } from '../../lib/db/usage'
import { db } from '../../lib/db'
import { users } from '../../lib/db/schema'
import { eq } from 'drizzle-orm'
import { OnboardingWizard } from './onboarding/wizard'
import { FeedbackWidget } from './feedback/widget'

async function UsagePill() {
  try {
    const userId = await getOrCreateDbUserId()
    const { used, limit } = await checkMonthlyLimit(userId)
    if (!isFinite(limit)) return null  // paid plan — no usage pill
    const pct = Math.min(100, (used / limit) * 100)
    const barColor = used >= limit ? 'bg-rose-500' : used >= Math.floor(limit * 0.8) ? 'bg-amber-500' : 'bg-foreground/40'
    return (
      <Link href="/usage" className="flex items-center gap-1.5 group" title="My usage">
        <div className="w-12 h-1 rounded-full bg-muted overflow-hidden shrink-0">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground leading-none tabular-nums transition-colors whitespace-nowrap">{used}/{limit}</span>
      </Link>
    )
  } catch {
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId: clerkId } = await auth()
  const isAdmin = !!process.env.ADMIN_CLERK_USER_ID && clerkId === process.env.ADMIN_CLERK_USER_ID

  let userId: string | null = null
  let user: Awaited<ReturnType<typeof db.query.users.findFirst>> | null = null
  try {
    userId = await getOrCreateDbUserId()
    if (userId) user = await db.query.users.findFirst({ where: eq(users.id, userId) }) ?? null
  } catch { /* layout renders without user data — page-level error boundaries handle specifics */ }
  const showOnboarding = userId != null && (!user?.onboardingComplete || user.onboardingComplete === 'false')

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showOnboarding && <OnboardingWizard />}
      <Nav usageSlot={<Suspense fallback={null}><UsagePill /></Suspense>} />
      <main className="p-6 flex-1 pb-24 sm:pb-6 max-w-6xl mx-auto w-full">{children}</main>
      <FeedbackWidget />
      <footer className="px-6 py-4 border-t border-border/40 flex items-center justify-center gap-6 text-xs text-muted-foreground/60">
        <Link href="/about" className="hover:text-muted-foreground transition-colors">About</Link>
        <Link href="/faq" className="hover:text-muted-foreground transition-colors">FAQ</Link>
        <Link href="/contact" className="hover:text-muted-foreground transition-colors">Contact</Link>
        {isAdmin && (
          <>
            <Link href="/admin/usage" className="hover:text-muted-foreground transition-colors">Usage ↗</Link>
            <Link href="/admin/techniques" className="hover:text-muted-foreground transition-colors">Techniques ↗</Link>
            <Link href="/admin/feedback" className="hover:text-muted-foreground transition-colors">Feedback ↗</Link>
          </>
        )}
      </footer>
    </div>
  )
}
