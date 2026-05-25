'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const BACK_LINK_CLASS = 'text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/50 hover:text-muted-foreground inline-block mb-3 transition-colors'

function BackLinkInner() {
  const searchParams = useSearchParams()
  const back = searchParams.get('back')
  if (back === '/gameplans') {
    return <Link href="/gameplans" className={BACK_LINK_CLASS}>← My Gameplans</Link>
  }
  return <Link href="/tournaments" className={BACK_LINK_CLASS}>← Tournaments</Link>
}

export function TournamentBackLink() {
  return (
    <Suspense fallback={<Link href="/tournaments" className={BACK_LINK_CLASS}>← Tournaments</Link>}>
      <BackLinkInner />
    </Suspense>
  )
}

export function TournamentNav({ id }: { id: string }) {
  const pathname = usePathname()

  const tabs = [
    { href: `/tournaments/${id}/opponents`, label: 'Opponents' },
    { href: `/tournaments/${id}/gameplan`, label: 'Gameplan' },
  ]

  return (
    <nav className="flex gap-1 border-b pb-0">
      {tabs.map(({ href, label }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`text-sm px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'text-foreground border-foreground'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
