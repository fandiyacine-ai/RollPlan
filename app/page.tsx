import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">

      {/* Nav */}
      <nav className="px-6 h-14 flex items-center justify-between border-b border-border/60 sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <span className="font-black text-lg tracking-tight">
          Frame<span className="text-muted-foreground">Matters</span>
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
      <section className="flex flex-col items-center justify-center flex-1 px-6 py-24 text-center">
        <div className="max-w-3xl space-y-7">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground border rounded-full px-4 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Powered by Google Gemini AI
          </div>

          <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none">
            Every frame tells<br />
            <span className="text-muted-foreground">the truth.</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Upload your BJJ footage and get a full breakdown — positions, dominance,
            key moments, and coaching notes — all traced back to timestamps in your video.
          </p>

          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }))}>
              Analyse My Game
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Scout an Opponent
            </Link>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 pb-20 max-w-5xl mx-auto w-full">
        <div className="grid sm:grid-cols-3 gap-4">

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-950 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Match Breakdown</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload your footage. AI maps every position, transition, and key moment.
                See time on mat, who was dominant, and where matches turned.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-blue-950 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Frame by Frame</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pause at any moment and ask the AI what happened.
                Get instant explanations of positions, mistakes, and missed opportunities.
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="w-10 h-10 rounded-lg bg-amber-950 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <div>
              <h3 className="font-semibold mb-1">Scout Opponents</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Upload their footage before a tournament.
                AI builds you a gameplan based on their tendencies, favourite submissions, and weak spots.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* How it works */}
      <section className="border-t px-6 py-20 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-center mb-12">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-10">
          <div className="text-center space-y-3">
            <div className="text-4xl font-black text-muted-foreground/25">01</div>
            <h3 className="font-semibold">Upload footage</h3>
            <p className="text-sm text-muted-foreground">
              Drop in a match clip or a full mat recording. MP4, MOV, AVI up to 2 GB.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="text-4xl font-black text-muted-foreground/25">02</div>
            <h3 className="font-semibold">AI analyses it</h3>
            <p className="text-sm text-muted-foreground">
              Google Gemini identifies positions, key events, and patterns. Takes a few minutes.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="text-4xl font-black text-muted-foreground/25">03</div>
            <h3 className="font-semibold">Review your game</h3>
            <p className="text-sm text-muted-foreground">
              See the breakdown, chat with the AI about specific moments, and build your next gameplan.
            </p>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="border-t px-6 py-20 text-center">
        <div className="max-w-xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold">Ready to see your game clearly?</h2>
          <p className="text-muted-foreground">
            Free to start. Upload your first match and get a full breakdown in minutes.
          </p>
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }))}>
            Start for free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <span className="font-bold tracking-tight">
          Frame<span className="opacity-60">Matters</span>
        </span>
        <p className="text-center sm:text-right max-w-sm">
          Your video is processed by Google Gemini AI and stored securely.
          You own your data and can delete it at any time from your account.
        </p>
      </footer>

    </main>
  )
}
