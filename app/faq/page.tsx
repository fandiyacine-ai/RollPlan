import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'
import { InstagramIcon } from '@/components/icons/instagram'

export const metadata = {
  title: 'FAQ — RollPlan',
  description: 'Answers to common questions about RollPlan: AI match analysis, opponent scouting, gameplans, Match Day, usage limits, and more.',
  alternates: { canonical: '/faq' },
}

const FAQ = [
  {
    q: 'How do I add a match for analysis?',
    a: 'Click "+ Analyse My Match" in the nav bar. Paste a YouTube or direct video URL (or upload a file). The AI will process position segments, key events, and confidence scores automatically — it usually takes 1–3 minutes.',
  },
  {
    q: 'What videos can I analyse?',
    a: 'Any publicly accessible YouTube URL works. You can also upload your own footage directly. For opponent scouting, paste the URL of their public competition footage — use the "Scout Opponent" section to attach it to a tournament opponent.',
  },
  {
    q: 'How is "control rate" calculated?',
    a: 'Control rate is the percentage of analysed mat time during which you (or your opponent, in scouted footage) held a dominant position — top position, back control, mount, or guard passing. It excludes neutral scrambles and standing exchanges.',
  },
  {
    q: 'What is the Match Timeline?',
    a: 'The Timeline tab on any match detail page shows every position and event in chronological order with timestamps. Dots are coloured by who was dominant at that moment. Use it to quickly replay the narrative of a match without rewatching.',
  },
  {
    q: 'What is a Match Report?',
    a: 'The AI writes a 3-paragraph coaching note: how the match flowed, the key turning points, and specific drills to prioritise. Click "Generate Match Report" on any analysed match. You can regenerate it at any time.',
  },
  {
    q: 'How does opponent scouting work?',
    a: 'Go to "Scout Opponent" and create a tournament entry. Add an opponent and paste their match footage URL (YouTube or direct upload). The AI analyses their tendencies — favourite attacks, defensive gaps, control patterns — which feeds directly into the Gameplan page.',
  },
  {
    q: 'Can I connect a Smoothcomp bracket?',
    a: 'Yes. When creating or editing a tournament, paste any URL from your event on smoothcomp.com (schedule page, bracket page — any link works). Once a bracket URL is saved, an "Import from bracket" button appears on the Opponents page. Clicking it scrapes your draw and lets you select which athletes to import in one step. After a bracket is published, a "Sync from bracket" button also appears — it pulls the latest draw and auto-updates match results.',
  },
  {
    q: 'How do I import opponents from a Smoothcomp bracket?',
    a: 'Open a tournament with a Smoothcomp bracket URL linked, then click "Import from bracket" on the Opponents page. A dialog loads your draw — uncheck yourself before clicking Import. The app auto-discovers past competition footage for every imported athlete and starts scanning immediately. You can still add opponents manually if they\'re not in the bracket.',
  },
  {
    q: 'Can I edit an opponent\'s name or notes after adding them?',
    a: 'Yes — tap the pencil icon on any opponent card on the Opponents page. You can update the name and seeding notes at any time. Existing footage scans and gameplans are not affected by the rename.',
  },
  {
    q: 'What if footage analysis fails?',
    a: 'Failed video rows show an error message and a "Re-scan" button. Click Re-scan to reset the video and re-queue it for analysis — no need to delete and re-add the URL. Common causes of failure: private or age-restricted YouTube videos, videos that have been deleted, and very short clips (under 30 seconds). If a match fails with "No matches found", the AI scanned the video but couldn\'t detect that specific athlete — try a timestamp link to the exact match start.',
  },
  {
    q: 'Can I correct a match result the AI got wrong?',
    a: 'Yes. Open the match detail page for any analysed match and tap "Wrong result?" next to the result badge. You can set the correct winner, method (Submission / Points / DQ / Other), or clear the result entirely. Bracket sync can also auto-correct results when you run it after the draw is published.',
  },
  {
    q: 'What is the Gameplan?',
    a: 'The Gameplan page combines your profile (belt, style, goals) with the opponent scouted data to generate a competition-day gameplan: your go-to attacks, opponent weapons to defend, and mat-side mental cues. Generate it once you have scouted footage ready. The page auto-refreshes while generating — no need to manually reload.',
  },
  {
    q: 'What is Match Day?',
    a: 'Match Day is your match-morning command centre. It shows all your upcoming tournaments with a countdown, and for each opponent a compact briefing card: the key attack to open with, the danger to watch, your attack chain, and win probability — all visible in one glance without opening individual gameplans. It\'s designed to be readable with one hand, standing in a sports hall, under pressure.',
  },
  {
    q: 'Can I compare my gameplan against my actual match result?',
    a: 'Yes. After a gameplan is generated, a "Post-match review" section appears at the bottom of the Gameplan page. Click "Link my match result" to connect one of your own analysed matches — it stores the link so you can quickly jump between the gameplan and the match data.',
  },
  {
    q: 'Can I correct a position label the AI got wrong?',
    a: 'Yes. On any match\'s Timeline tab, hover over a position row and click "Wrong?" — a dropdown appears inline with all 25 position types. Select the correct one and it saves immediately. Corrected positions are marked with a flag so the AI can learn from your feedback in future analysis passes.',
  },
  {
    q: 'Can I rate a gameplan?',
    a: 'Yes — use the thumbs-up / thumbs-down buttons next to the gameplan header after it\'s generated. Your rating helps you track which gameplans translated well and which didn\'t. You can change or clear your rating at any time.',
  },
  {
    q: 'What is the post-event banner?',
    a: 'After your tournament\'s event date passes, a banner appears on the Opponents page asking how it went. Pick your outcome (Gold / Silver / Bronze / Lost / Didn\'t compete) and add an optional note. This closes the loop on your prep and is stored against the tournament record.',
  },
  {
    q: 'How does the Coaching Notes section work?',
    a: 'The AI coaching report is structured into three labeled sections — MATCH FLOW (the narrative), KEY MOMENTS (turning points), and DRILL TARGETS (specific reps to prioritise). It always refers to athletes by their actual names, not generic "you / opponent" language.',
  },
  {
    q: 'How does the AI handle my training goals?',
    a: 'Set your goals in Profile Settings. The AI references them when writing gameplans and coaching notes — for example, if you\'re drilling guard retention, the report will weight those observations more heavily.',
  },
  {
    q: 'How long does analysis take?',
    a: 'Typically 1–3 minutes for a standard match (up to ~15 minutes). Longer footage (30 min+) may take up to 5 minutes. You\'ll see an "Analysing…" badge on the match card while it processes.',
  },
  {
    q: 'Is my footage private?',
    a: 'Your uploaded footage and analysis results are private to your account. Public YouTube URLs you submit are not re-hosted — the AI reads them in-flight and the raw video is not stored on our servers.',
  },
  {
    q: 'What counts against my usage quota?',
    a: 'Each analysed match counts towards your monthly limit. The free tier allows 10 analysed matches per calendar month — the counter resets on the 1st of each month. Failed analyses and pending jobs do not count. You can see your current usage in the nav bar.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'A native iOS and Android app is in the works. The goal: film your match at the academy, analyse on the way home, and pull up your opponent gameplan standing in the arena — all from your phone. For now, RollPlan works well in any mobile browser. Sign up and we\'ll notify you when the app launches.',
  },
  {
    q: 'Is RollPlan in beta?',
    a: 'Yes — RollPlan is in active beta. Core features work reliably but you may encounter rough edges, and AI analysis isn\'t perfect. If something goes wrong, the "Re-scan" button resets a failed video and the "Wrong result?" and "Wrong?" correction tools let you fix AI mistakes inline. Found a bug or have feedback? Email feedback@rollplan.app — we read every message.',
  },
]

const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <Link href="/"><Wordmark /></Link>
        <Link href="/player-card" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to app
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Frequently Asked Questions</h1>
          <p className="text-muted-foreground">
            Everything you need to know about RollPlan. Something missing?{' '}
            <a href="mailto:support@rollplan.app" className="underline underline-offset-2 hover:text-foreground">
              Drop us a line.
            </a>
          </p>
        </div>

        <div className="space-y-1">
          {FAQ.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </main>

      <footer className="border-t px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground max-w-2xl mx-auto">
        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
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
        </div>
      </footer>
    </div>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border border-border/60 rounded-xl overflow-hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium select-none hover:bg-muted/40 transition-colors list-none">
        {q}
        <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="px-5 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border/40">
        {a}
      </div>
    </details>
  )
}
