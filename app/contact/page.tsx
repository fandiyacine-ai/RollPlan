import Link from 'next/link'

export const metadata = { title: 'Contact — RollPlan' }

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <Link href="/" className="text-xl font-extrabold tracking-tight [font-family:var(--font-brand)]">
          RollPlan
        </Link>
        <Link href="/player-card" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to app
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">Contact</h1>
          <p className="text-muted-foreground">
            We&apos;re a small team — we read every message and reply to all of them.
          </p>
        </div>

        <div className="space-y-4">
          <ContactCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
            }
            title="Support"
            description="Bug reports, billing questions, anything broken — we'll get back to you within 24 hours."
            cta="support@rollplan.app"
            href="mailto:support@rollplan.app"
          />
          <ContactCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            }
            title="Feedback & feature requests"
            description="Using RollPlan and have an idea? We&apos;re actively building — your input shapes what ships next."
            cta="feedback@rollplan.app"
            href="mailto:feedback@rollplan.app"
          />
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold">Before you write</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Most common questions are answered in the{' '}
            <Link href="/faq" className="underline underline-offset-2 hover:text-foreground">
              FAQ
            </Link>
            {' '}— analysis timing, how scouting works, quota limits, and how to correct AI mistakes.
          </p>
        </div>
      </main>
    </div>
  )
}

function ContactCard({
  icon,
  title,
  description,
  cta,
  href,
}: {
  icon: React.ReactNode
  title: string
  description: string
  cta: string
  href: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 space-y-3">
      <div className="flex items-center gap-2.5 text-foreground">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      <a
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-2"
      >
        {cta}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
    </div>
  )
}
