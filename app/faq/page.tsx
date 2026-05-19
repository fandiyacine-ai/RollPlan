import Link from 'next/link'

export const metadata = { title: 'FAQ — FrameMatters' }

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
    a: 'Go to "Scout Opponent" and create a tournament entry. Add an opponent and paste their match footage URL. The AI analyses their tendencies — favourite attacks, defensive gaps, control patterns — which feeds directly into the Gameplan page.',
  },
  {
    q: 'What is the Gameplan?',
    a: 'The Gameplan page combines your profile (belt, style, goals) with the opponent scouted data to generate a competition-day gameplan: your go-to attacks, opponent weapons to defend, and mat-side mental cues. Generate it once you have scouted footage ready.',
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
    q: 'Can I correct the AI analysis?',
    a: 'Not yet — position and event correction is on the roadmap. For now, if the AI mislabels a position you can note it in the Match Report generation prompt, or add a note to the coaching section.',
  },
  {
    q: 'Is my footage private?',
    a: 'Your uploaded footage and analysis results are private to your account. Public YouTube URLs you submit are not re-hosted — the AI reads them in-flight and the raw video is not stored on our servers.',
  },
  {
    q: 'What counts against my usage quota?',
    a: 'Each analysed match counts towards your monthly limit. The free tier allows 10 analysed matches per calendar month — the counter resets on the 1st of each month. Failed analyses and pending jobs do not count. You can see your current usage in the nav bar.',
  },
]

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 z-40 bg-background/90 backdrop-blur-sm">
        <Link href="/" className="text-xl font-extrabold tracking-tight [font-family:var(--font-brand)]">
          Frame<span className="text-muted-foreground font-bold">Matters</span>
        </Link>
        <Link href="/player-card" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Back to app
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Frequently Asked Questions</h1>
          <p className="text-muted-foreground">
            Everything you need to know about FrameMatters. Something missing?{' '}
            <a href="mailto:support@framematters.app" className="underline underline-offset-2 hover:text-foreground">
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
