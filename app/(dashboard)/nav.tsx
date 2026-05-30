'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { ThemeToggle } from './theme-toggle'
import { NotificationBell } from './notifications/bell'
import { buttonVariants } from '@/components/ui/button'

const NAV = [
  { href: '/player-card', label: 'My Stats' },
  { href: '/matches', label: 'My Matches' },
  { href: '/tournaments', label: 'Tournaments' },
  { href: '/gameplans', label: 'Gameplans' },
  { href: '/game-day', label: 'Competition Day' },
]

const TAB_NAV = [
  {
    href: '/player-card',
    label: 'My Stats',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M12 8v4l3 3"/>
      </svg>
    ),
  },
  {
    href: '/matches',
    label: 'My Matches',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 10l-4 4L7 10"/><rect x="3" y="3" width="18" height="18" rx="2"/>
      </svg>
    ),
  },
  {
    href: '/tournaments',
    label: 'Tournaments',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
      </svg>
    ),
  },
  {
    href: '/gameplans',
    label: 'Gameplans',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    href: '/game-day',
    label: 'Competition Day',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
]

function BottomTabBar() {
  const path = usePathname()
  const searchParams = useSearchParams()
  const back = searchParams.get('back') ?? ''

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border/60">
      <div className="flex items-stretch h-16">
        {TAB_NAV.map(({ href, label, icon }) => {
          let active: boolean
          if (path.startsWith('/matches/')) {
            if (href === '/tournaments') active = back.startsWith('/tournaments')
            else if (href === '/matches') active = !back.startsWith('/tournaments')
            else active = false
          } else {
            active = path === href || path.startsWith(href + '/')
          }
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-foreground' : 'text-muted-foreground/60'
              }`}
            >
              {icon}
              <span className={`text-[10px] font-medium ${active ? 'text-foreground' : ''}`}>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function NavLinks({ onLinkClick }: { onLinkClick?: () => void }) {
  const path = usePathname()
  const searchParams = useSearchParams()
  const back = searchParams.get('back') ?? ''

  return (
    <>
      {NAV.map(({ href, label }) => {
        let active: boolean
        if (path.startsWith('/matches/')) {
          if (href === '/tournaments') active = back.startsWith('/tournaments')
          else if (href === '/matches') active = !back.startsWith('/tournaments')
          else active = false
        } else {
          active = path === href || path.startsWith(href + '/')
        }
        return (
          <Link
            key={href}
            href={href}
            onClick={onLinkClick}
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
    </>
  )
}

export function Nav({ usageSlot }: { usageSlot?: React.ReactNode }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
    <Suspense fallback={null}><BottomTabBar /></Suspense>
    <nav className="border-b border-border/60 sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <div className="h-14 flex items-center justify-between">
        {/* Left: brand + desktop nav */}
        <div className="flex items-center gap-6 sm:gap-8">
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <span className="text-xl font-extrabold tracking-tight [font-family:var(--font-brand)]">Roll<span className="text-muted-foreground font-bold">Plan</span></span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 border border-border/50 rounded px-1.5 py-0.5 leading-none hidden sm:inline">Beta</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden sm:flex items-center gap-1">
            <Suspense fallback={
              <div className="flex items-center gap-1">
                {NAV.map(({ href, label }) => (
                  <Link key={href} href={href} className="px-3 py-1.5 text-sm rounded-md text-muted-foreground">{label}</Link>
                ))}
              </div>
            }>
              <NavLinks />
            </Suspense>
          </div>

          <div className="hidden sm:block">
            <Link href="/upload" className={buttonVariants({ size: 'sm' })}>
              + Analyse My Match
            </Link>
          </div>
        </div>

        {/* Right: desktop icons + mobile controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Desktop only */}
          <div className="hidden sm:flex items-center gap-3">
            {usageSlot}
            <NotificationBell />
            <ThemeToggle />
            <Link
              href="/settings"
              className={`p-1.5 rounded-md transition-colors ${
                path === '/settings' ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
          </div>

          <UserButton />

          {/* Mobile: compact CTA + hamburger */}
          <div className="sm:hidden">
            <Link href="/upload" className={buttonVariants({ size: 'sm' })}>
              + Analyse
            </Link>
          </div>
          <button
            className="sm:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setOpen(o => !o)}
            aria-label="Menu"
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="sm:hidden border-t border-border/40 py-3 flex flex-col gap-1">
          <Suspense fallback={
            <div className="flex flex-col gap-1">
              {NAV.map(({ href, label }) => (
                <Link key={href} href={href} className="px-3 py-2 text-sm rounded-md text-muted-foreground">{label}</Link>
              ))}
            </div>
          }>
            <NavLinks onLinkClick={() => setOpen(false)} />
          </Suspense>
          <div className="mt-2 pt-2 border-t border-border/40 flex items-center gap-3 px-3">
            {usageSlot}
            <NotificationBell />
            <ThemeToggle />
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className={`p-1.5 rounded-md transition-colors ${
                path === '/settings' ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
              title="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
          </div>
        </div>
      )}
      </div>
    </nav>
    </>
  )
}
