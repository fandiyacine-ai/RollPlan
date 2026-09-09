import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/wordmark'
import { InstagramIcon } from '@/components/icons/instagram'

export const metadata = {
  title: 'About',
  description: 'Why RollPlan exists: an AI-powered BJJ match analysis and opponent scouting tool built by a grappler who got tired of going into matches blind.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <Link href="/">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            FAQ
          </Link>
          <Link href="/sign-up" className={cn(buttonVariants({ size: 'sm' }))}>
            Get started
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16 space-y-16">

        {/* Hero */}
        <div className="space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">About RollPlan</p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-none">
            I got tired of<br />
            <span className="text-muted-foreground">heading in blind.</span>
          </h1>
        </div>

        {/* Story */}
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none space-y-6 text-[15px] leading-relaxed">

          <p className="text-foreground/90">
            Every competitor knows the night-before ritual. You&apos;re watching footage for the third time,
            trying to figure out what that opponent does from half guard, scribbling notes into your phone,
            telling yourself you&apos;re prepared. You&apos;re not. You&apos;re just tired.
          </p>

          <p className="text-muted-foreground">
            The problem isn&apos;t that the footage doesn&apos;t exist. Competition streams, YouTube matches,
            uploaded clips — there&apos;s more BJJ footage available now than at any point in the sport&apos;s history.
            The problem is that watching video without a framework is just watching video. You notice the same
            things you already knew. You miss the patterns that would actually change how you prepare.
          </p>

          <p className="text-muted-foreground">
            The athletes who&apos;ve solved this have a coach watching their footage, building a breakdown,
            writing a gameplan. That&apos;s how the top competitors prep. But most of us don&apos;t have that — we&apos;re
            self-coached, or our coach has thirty other students, or we just don&apos;t have the budget
            for someone to sit with our footage for two hours before every tournament.
          </p>

          <div className="border-l-2 border-blue-500/40 pl-5 my-8">
            <p className="text-foreground font-medium text-base">
              I built RollPlan because I wanted what those athletes had — without needing a coaching staff to get it.
            </p>
          </div>

          <p className="text-muted-foreground">
            The tools that existed were either built for teams (Dartfish costs what some people pay in rent,
            and assumes you have a dedicated analyst) or completely generic (asking a general AI to break down
            a BJJ match doesn&apos;t work — it doesn&apos;t know half guard from side control).
            Nothing was built for the individual competitor who just wants to be better prepared
            than they were last time.
          </p>

          <p className="text-muted-foreground">
            So I built it myself. Paste a link to a match — yours or your opponent&apos;s — and the AI
            does what a good analyst does: identifies every position, every key moment,
            the tendencies that keep showing up. For tournaments, connect your Smoothcomp bracket
            and it scans every opponent in your draw and writes you a gameplan for each of them.
            On competition morning, one screen shows you exactly what to open with
            and what danger to watch for. No reading required.
          </p>

          <p className="text-muted-foreground">
            RollPlan is still in beta. The AI isn&apos;t perfect — position labels can be wrong,
            and sometimes it misses a detail a human coach would catch. Every incorrect label
            can be corrected inline, and every correction makes future analysis better.
            The mobile app isn&apos;t out yet. There are rough edges.
          </p>

          <p className="text-foreground/90">
            But the core thing works: you upload footage, you get a real breakdown,
            and you go into your next competition knowing more than you did.
            That&apos;s what this is about.
          </p>

        </div>

        {/* Founder sig */}
        <div className="flex items-center gap-4 py-2">
          <div className="w-10 h-10 rounded-full bg-blue-950 border border-blue-800/50 flex items-center justify-center text-blue-400 font-bold text-sm flex-shrink-0">
            Y
          </div>
          <div>
            <p className="text-sm font-semibold">Yacine</p>
            <p className="text-xs text-muted-foreground">Founder, RollPlan</p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* What we stand for */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold">What we stand for</h2>
          <div className="grid gap-4">
            <Principle
              title="The individual competitor deserves the same tools as the professional."
              body="Analysis that used to require a coaching staff and a dedicated analyst should be available to every serious competitor — at any belt, at any event, at any budget."
            />
            <Principle
              title="Preparation is a skill. Treat it that way."
              body="Showing up to a tournament without having studied your opponents isn't just leaving points on the table — it's disrespecting the work you put in on the mat. RollPlan exists to close that gap."
            />
            <Principle
              title="The AI should earn your trust, not assume it."
              body="Every analysis includes confidence scores. Every wrong label can be corrected. We show you where the AI is uncertain so you can decide what to trust. No black boxes."
            />
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* CTA */}
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-xl font-bold">Still in beta — and still building.</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you compete in BJJ — or you&apos;re a parent whose kid does — gi or no-gi, local open to world championship,
              this is for you. Free to start. No credit card. Upload your first match and have a full breakdown in under five minutes.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/sign-up" className={cn(buttonVariants({ size: 'lg' }))}>
              Analyse my game
            </Link>
            <a
              href="mailto:feedback@rollplan.ai"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}
            >
              Send feedback
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Have a question or found a bug?{' '}
            <a href="mailto:support@rollplan.ai" className="underline underline-offset-2 hover:text-foreground">
              support@rollplan.ai
            </a>
            {' '}— I read every message.
          </p>
        </div>

      </main>

      <footer className="border-t px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground max-w-2xl mx-auto">
        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
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
      </footer>
    </div>
  )
}

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 space-y-2">
      <p className="text-sm font-semibold leading-snug">{title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )
}
