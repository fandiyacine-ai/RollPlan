import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { InstagramIcon } from '@/components/icons/instagram'

const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#1D4FA8',
    borderRadius: '0.75rem',
  },
  elements: {
    card: 'shadow-none border border-border/60',
    footerActionLink: 'text-[#1D4FA8] hover:text-[#163d85]',
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

      <footer className="flex items-center gap-5 text-xs text-muted-foreground">
        <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
        <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
        <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        <a
          href="https://www.instagram.com/rollplan.ai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="RollPlan on Instagram"
          className="hover:text-foreground transition-colors"
        >
          <InstagramIcon className="w-4 h-4" />
        </a>
      </footer>
    </div>
  )
}

export { CLERK_APPEARANCE }
