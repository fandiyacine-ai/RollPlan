import Link from 'next/link'
import Image from 'next/image'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/wordmark'
import { InstagramIcon } from '@/components/icons/instagram'
import { ScoutMockup, FightCardMockup } from '@/components/marketing/section-mockups'
import { db } from '@/lib/db'
import { matches, tournaments, tournamentOpponents } from '@/lib/db/schema'
import { sql, eq } from 'drizzle-orm'

export const revalidate = 3600

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'RollPlan',
  url: 'https://rollplan.ai',
  logo: 'https://rollplan.ai/RollPlan-logo.png',
  sameAs: ['https://www.instagram.com/rollplan.ai'],
}

const GOLD_CTA = 'bg-[#F5C518] text-zinc-900 [a]:hover:bg-[#F5C518]/90 border-transparent'

const softwareLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'RollPlan',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'Web',
  description: 'AI-powered BJJ match analysis, opponent scouting, and gameplan generation with win probability.',
  url: 'https://rollplan.ai',
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
    { '@type': 'Offer', name: 'Pro', price: '5', priceCurrency: 'EUR' },
  ],
}

async function getLiveStats() {
  const [[m], [t], [o]] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(matches).where(eq(matches.status, 'analysed')),
    db.select({ c: sql<number>`count(*)` }).from(tournaments),
    db.select({ c: sql<number>`count(*)` }).from(tournamentOpponents),
  ])
  return { matches: Number(m.c), tournaments: Number(t.c), opponents: Number(o.c) }
}

export default async function HomePage() {
  const stats = await getLiveStats()
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />

      {/* Nav */}
      <nav className="px-6 h-14 flex items-center justify-between border-b border-border/60 sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Wordmark />
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70 border border-border/50 rounded px-1.5 py-0.5 leading-none">Beta</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Sign In
          </Link>
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'sm' }), GOLD_CTA)}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-12 pb-12 sm:pt-16">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <div className="space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground border rounded-full px-4 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Powered by Google Gemini AI
            </div>

            <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none">
              Every frame tells<br />
              <span className="text-muted-foreground">the truth.</span>
            </h1>

            <p className="text-base text-muted-foreground leading-relaxed max-w-lg mx-auto lg:mx-0">
              RollPlan turns your BJJ footage into a full analysis — every position,
              transition, and turning point traced to the exact timestamp.
              No more guessing what went wrong.
            </p>

            <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
              <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }), GOLD_CTA)}>
                Analyse My Game
              </Link>
              <Link href="/sign-up" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                Scout an Opponent
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-br from-blue-500/25 via-[#F5C518]/15 to-transparent rounded-[2rem] blur-2xl -z-10" />
            <div className="rounded-2xl border border-border/60 overflow-hidden shadow-2xl shadow-black/10">
              <Image
                src="/marketing/player-card.png"
                alt="RollPlan Player Card — automatic match breakdown with control rate, top attacks, and position timeline"
                width={1600}
                height={1000}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Live stats */}
      <section className="px-6 pb-12">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-x-12 gap-y-4 text-center">
          <div>
            <p className="text-3xl font-black">{stats.matches}</p>
            <p className="text-xs text-muted-foreground mt-1">matches analysed</p>
          </div>
          <div>
            <p className="text-3xl font-black">{stats.opponents}</p>
            <p className="text-xs text-muted-foreground mt-1">opponents scouted</p>
          </div>
          <div>
            <p className="text-3xl font-black">{stats.tournaments}</p>
            <p className="text-xs text-muted-foreground mt-1">tournaments tracked</p>
          </div>
        </div>
      </section>

      {/* What it does — compact feature grid */}
      <section className="px-6 pb-16 max-w-4xl mx-auto w-full">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-5 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            </div>
            <h3 className="font-semibold text-sm">Automatic match breakdown</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every position, transition, and key event — timestamped, with coaching notes. No tagging required.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-blue-950 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </div>
            <h3 className="font-semibold text-sm">Frame by Frame AI chat</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Pause the video anywhere and ask the AI what happened. It sees the exact frame you're on.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-amber-950 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <h3 className="font-semibold text-sm">Scout from a bracket — or a long stream</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Import AJP, IBJJF, or Smoothcomp brackets, or point the AI at a multi-hour stream and it clips out your opponent's matches.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-violet-950 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
            <h3 className="font-semibold text-sm">Gameplans, win probability &amp; Fight Card</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A Favourable, Even, or Tough verdict and an attack plan for every opponent — shareable as a Fight Card.
            </p>
          </div>
        </div>
      </section>

      {/* See it in action — Frame by Frame screenshot */}
      <section className="px-6 pb-16 max-w-4xl mx-auto w-full">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-2xl font-bold">Pause anywhere. Ask anything.</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            "Why did I lose the underhook here?" The AI sees the exact frame you're paused on
            and answers in context — every position and event on the timeline, linked to its timestamp.
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 overflow-hidden shadow-2xl shadow-black/20">
          <Image
            src="/marketing/frame-by-frame.png"
            alt="RollPlan Frame by Frame AI chat — synced to the video timeline with position and event breakdown"
            width={1440}
            height={710}
            className="w-full h-auto"
          />
        </div>
      </section>

      {/* Scout the bracket or a long stream */}
      <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="space-y-3 text-center lg:text-left order-2 lg:order-1">
            <h2 className="text-2xl font-bold">Scout the whole bracket — or one long stream</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto lg:mx-0">
              Import from AJP, IBJJF, or Smoothcomp and RollPlan pulls every opponent's record and
              footage automatically. Or paste a tournament stream and tell the AI who to look for —
              it scans hours of footage and clips out their matches. Either way, you get an AI
              gameplan with a win probability for each one.
            </p>
          </div>
          <div className="order-1 lg:order-2">
            <ScoutMockup />
          </div>
        </div>
      </section>

      {/* Fight Card */}
      <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <FightCardMockup />
          </div>
          <div className="space-y-3 text-center lg:text-left">
            <h2 className="text-2xl font-bold">Your Fight Card — ready before you compete</h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto lg:mx-0">
              Head-to-head record, game styles, dominant positions, top attacks, and your AI gameplan
              — open with, watch out for, attack chain — all on one page. Share it with your coach
              or squad in one tap.
            </p>
          </div>
        </div>
      </section>

      {/* How to use — step guide */}
      <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
        <h2 className="text-xl font-bold text-center mb-8">How to use it</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            {
              n: '5',
              title: 'Compete with Match Day',
              body: 'On the morning of the tournament, open Match Day. Every opponent in your draw gets a one-glance card — win probability, what to open with, what to watch for. Built to read in five seconds, one-handed, between matches.',
            },
          ].map((step) => (
            <div key={step.n} className="rounded-xl border bg-card p-5 space-y-2">
              <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold">
                {step.n}
              </div>
              <h3 className="font-semibold text-sm">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
        <h2 className="text-xl font-bold text-center mb-8">Built for every grappler</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h3 className="font-semibold text-sm">Competitors</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Auto-scout opponents from AJP, IBJJF, and Smoothcomp, then walk in with an
              AI gameplan built around their tendencies and weaknesses.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h3 className="font-semibold text-sm">Hobbyists</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Upload any roll or class footage and see exactly where your game holds up —
              and where it breaks down — frame by frame.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 space-y-2">
            <h3 className="font-semibold text-sm">Coaches &amp; teammates</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Share a full match report with your coach in one tap. They walk into your
              next session already knowing what to work on.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 pb-16 max-w-3xl mx-auto w-full">
        <div className="text-center space-y-2 mb-8">
          <h2 className="text-2xl font-bold">Start free. Upgrade when you're ready.</h2>
          <p className="text-sm text-muted-foreground">No credit card required to get started.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border bg-card p-6 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Free</p>
              <p className="text-3xl font-black mt-1">€0</p>
              <p className="text-xs text-muted-foreground">15 analyses a month</p>
            </div>
            <ul className="space-y-2.5 text-sm">
              {[
                'Match breakdowns & Frame by Frame AI chat',
                'Opponent scouting — bracket import or stream scan',
                'Gameplans with win probability',
                'Fight Card & Match Day',
                'AI training plan',
                '1 active tournament',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400 mt-0.5 flex-shrink-0">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-[#F5C518]/60 bg-card p-6 space-y-4 relative">
            <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-wider bg-[#F5C518] text-zinc-900 rounded-full px-2.5 py-1">
              14-day free trial
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Pro</p>
              <p className="text-3xl font-black mt-1">€5<span className="text-base font-medium text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">or €50/year — save 17%</p>
            </div>
            <ul className="space-y-2.5 text-sm">
              {[
                'Everything in Free, no monthly cap',
                'Unlimited video analysis',
                'Unlimited opponent scouting',
                'Unlimited tournaments',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#F5C518] mt-0.5 flex-shrink-0">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground pt-3 border-t">
              No feature gates, no separate "competitor" tier — just no limits. Cancel anytime.
            </p>
          </div>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Scouting, gameplans, Fight Card, and Match Day are all on Free from day one. Pro just removes the monthly cap.
        </p>
      </section>

      {/* CTA */}
      <section className="border-t px-6 py-20 text-center">
        <div className="max-w-lg mx-auto space-y-5">
          <h2 className="text-2xl font-bold">Start with your next match</h2>
          <p className="text-sm text-muted-foreground">
            Free to use. Upload your first clip and have a full breakdown in under five minutes.
          </p>
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }), GOLD_CTA)}>
            Get started — it&apos;s free
          </Link>
        </div>
      </section>

      {/* Mobile app teaser */}
      <section className="px-6 pb-16 max-w-3xl mx-auto w-full">
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/70">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div className="flex-1 text-center sm:text-left space-y-1.5">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <p className="font-bold text-sm">Mobile app coming soon</p>
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5 leading-none">Soon</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              RollPlan for iOS and Android. Film at the academy, analyse on the way home, and check your gameplan standing in the arena.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <Wordmark />
        <div className="flex items-center gap-5">
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
          <Link href="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <a
            href="https://www.instagram.com/rollplan.ai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="RollPlan on Instagram"
            className="hover:text-foreground transition-colors"
          >
            <InstagramIcon className="w-4 h-4" />
          </a>
        </div>
        <p className="text-center sm:text-right max-w-sm">
          Your video is processed by Google Gemini AI and stored securely.
          You own your data and can delete it at any time from your account.
        </p>
      </footer>

    </main>
  )
}
