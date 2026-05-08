import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/player-card" className="font-bold text-lg">RollPlan</Link>
          <Link href="/player-card" className="text-sm text-muted-foreground hover:text-foreground">Player Card</Link>
          <Link href="/tournaments" className="text-sm text-muted-foreground hover:text-foreground">Tournaments</Link>
          <Link href="/upload" className="text-sm text-muted-foreground hover:text-foreground">Upload</Link>
        </div>
        <UserButton />
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
