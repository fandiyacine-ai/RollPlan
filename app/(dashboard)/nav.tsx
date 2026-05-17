'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ThemeToggle } from './theme-toggle'
import { buttonVariants } from '@/components/ui/button'

const NAV = [
  { href: '/player-card', label: 'My Matches' },
  { href: '/tournaments', label: 'Scout Opponent' },
]

export function Nav() {
  const path = usePathname()

  return (
    <nav className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
      <div className="flex items-center gap-8">
        {/* Brand */}
        <Link href="/player-card" className="flex items-center gap-2 group">
          <span className="font-black text-lg tracking-tight">Frame<span className="text-muted-foreground">Matters</span></span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1">
          {NAV.map(({ href, label }) => {
            const active = path === href || path.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  active
                    ? 'text-foreground font-medium bg-muted'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </div>

        <Link
          href="/upload"
          className={buttonVariants({ size: 'sm' })}
        >
          + Analyse My Match
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserButton />
      </div>
    </nav>
  )
}
