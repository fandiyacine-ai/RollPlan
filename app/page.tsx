import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">

      {/* Nav */}
      <nav className="px-6 h-14 flex items-center justify-between border-b border-border/60 sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <span className="text-xl font-extrabold tracking-tight [font-family:var(--font-brand)]">
          Roll<span className="text-muted-foreground font-bold">Plan</span>
        </span>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Sign In
          </Link>
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'sm' }))}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground border rounded-full px-4 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by Google Gemini AI
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none">
            Every frame tells<br />
            <span className="text-muted-foreground">the truth.</span>
          </h1>

          <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
            RollPlan turns your BJJ footage into a full analysis — every position,
            transition, and turning point traced to the exact timestamp.
            No more guessing what went wrong.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }))}>
              Analyse My Game
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Scout an Opponent
            </Link>
          </div>
        </div>
      </section>

      {/* What it does — central explanation */}
      <section className="px-6 py-16 max-w-3xl mx-auto w-full">
        <div className="rounded-2xl border bg-card p-8 sm:p-10 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">What RollPlan does</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Upload a match clip and the AI does the work — no tagging, no manual breakdown.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-950 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1">Automatic match breakdown</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The AI identifies every position you spent time in, how dominant you were in each,
                  and the key events (takedowns, guard passes, submission attempts, sweeps).
                  You see a timestamped timeline of the whole match.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1">Frame by Frame — AI video review</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Pause the video at any moment and ask the AI what happened.
                  "Why did I lose the underhook here?", "What could I have done at 3:12?"
                  The AI sees the same frame you're looking at and responds in context.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-amber-950 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-1">Opponent scouting</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Heading into a tournament? Add your potential opponents, submit their competition footage,
                  and the AI builds you a personalised gameplan — their tendencies, favourite positions,
                  and where they're vulnerable.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How to use — step guide */}
      <section className="px-6 pb-16 max-w-3xl mx-auto w-full">
        <h2 className="text-xl font-bold text-center mb-8">How to use it</h2>
        <div className="relative space-y-0">
          {/* connector line */}
          <div className="absolute left-4 top-5 bottom-8 w-px bg-border/60" />

          {[
            {
              n: '1',
              title: 'Upload your match',
              body: 'Go to Analyse My Match, drop in a video file (MP4, MOV, up to 2 GB), pick the format and a reference frame so the AI knows who you are on screen. Hit Upload.',
            },
            {
              n: '2',
              title: 'Wait a few minutes',
              body: 'Google Gemini processes the footage. A typical 5-minute match takes 2–4 minutes to analyse. You\'ll see the status update to Ready when it\'s done.',
            },
            {
              n: '3',
              title: 'Review your breakdown',
              body: 'Open the match to see your time-on-mat chart, key moments timeline, and AI coaching notes — each one linked to a timestamp you can jump to in the video.',
            },
            {
              n: '4',
              title: 'Go Frame by Frame',
              body: 'Hit "Frame by Frame" on any analysed match to open the AI chat. Pause the video anywhere and ask the AI what happened — it sees your current frame in real time.',
            },
          ].map((step) => (
            <div key={step.n} className="relative pl-10 pb-8">
              <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold z-10">
                {step.n}
              </div>
              <h3 className="font-semibold text-sm mb-1">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-20 text-center">
        <div className="max-w-lg mx-auto space-y-5">
          <h2 className="text-2xl font-bold">Start with your next match</h2>
          <p className="text-sm text-muted-foreground">
            Free to use. Upload your first clip and have a full breakdown in under five minutes.
          </p>
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }))}>
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <span className="font-extrabold tracking-tight text-foreground [font-family:var(--font-brand)]">
          Roll<span className="text-muted-foreground font-bold">Plan</span>
        </span>
        <div className="flex items-center gap-5">
          <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
        </div>
        <p className="text-center sm:text-right max-w-sm">
          Your video is processed by Google Gemini AI and stored securely.
          You own your data and can delete it at any time from your account.
        </p>
      </footer>

    </main>
  )
}
