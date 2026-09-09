const VERDICT_STYLES: Record<string, { bg: string; label: string }> = {
  favourable: { bg: 'bg-[#F5C518]/15 border-[#F5C518]/30 text-[#F5C518]', label: 'Favourable' },
  neutral: { bg: 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400', label: 'Even' },
  tough: { bg: 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400', label: 'Tough' },
}

const SCOUTED_OPPONENTS = [
  { name: 'J. Silva', verdict: 'favourable', winProb: 72 },
  { name: 'A. Costa', verdict: 'neutral', winProb: 51 },
  { name: 'M. Santos', verdict: 'tough', winProb: 38 },
]

export function ScoutMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/5 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <p className="text-sm font-semibold">IBJJF Europeans — Opponents</p>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 border border-border/50 rounded px-1.5 py-0.5 leading-none">
          3 scouted
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {SCOUTED_OPPONENTS.map((o) => {
          const cfg = VERDICT_STYLES[o.verdict]
          return (
            <div key={o.name} className="px-5 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-950 flex items-center justify-center text-blue-400 text-xs font-bold flex-shrink-0">
                  {o.name[0]}
                </div>
                <p className="text-sm font-medium">{o.name}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${cfg.bg}`}>
                {cfg.label} · {o.winProb}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const TOP_ATTACKS = [
  { label: 'Armbar', pct: 100 },
  { label: 'Triangle', pct: 70 },
  { label: 'Kimura', pct: 45 },
]

export function FightCardMockup() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/5 overflow-hidden p-5 space-y-5">
      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <p className="text-3xl font-black text-blue-400">8-2</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">You</p>
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/40">vs</span>
        <div className="text-center">
          <p className="text-3xl font-black text-rose-400">5-4</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Opponent</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">Game style</span>
          <span className="text-sm font-bold text-blue-400">Top player</span>
        </div>
        <div className="h-3 w-full rounded-full bg-blue-500/[0.12] overflow-hidden">
          <div className="h-full rounded-full bg-blue-500/60" style={{ width: '68%' }} />
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/55">Top attacks</span>
        {TOP_ATTACKS.map((a) => (
          <div key={a.label} className="flex items-center gap-2">
            <span className="text-xs w-16 flex-shrink-0">{a.label}</span>
            <div className="h-2 flex-1 rounded-full bg-blue-500/[0.12] overflow-hidden">
              <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${a.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-border/40 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">AI Gameplan</span>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${VERDICT_STYLES.favourable.bg}`}>
          Favourable · 68%
        </span>
      </div>
    </div>
  )
}
