import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#4ade80',
    borderRadius: '0.75rem',
  },
  elements: {
    card: 'shadow-none border border-border/60',
    footerActionLink: 'text-emerald-500 hover:text-emerald-600',
  },
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 py-12 bg-background">
      <Link href="/" className="flex items-center gap-2">
        <Wordmark />
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 border border-border/50 rounded px-1.5 py-0.5 leading-none">Beta</span>
      </Link>

      <div className="text-center space-y-1.5 max-w-xs">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
      </div>

      {children}
    </div>
  )
}

export { CLERK_APPEARANCE }
