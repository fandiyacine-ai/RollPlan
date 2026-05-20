'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
