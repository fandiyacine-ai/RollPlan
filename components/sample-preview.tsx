import { StatArcGauge } from './stat-arc-gauge'

function SampleBadge() {
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#F5C518]/15 text-[#F5C518] border border-[#F5C518]/30 flex-shrink-0">
      Sample
    </span>
  )
}

function SampleWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs font-semibold text-foreground/80">{title}</p>
        <SampleBadge />
      </div>
      {children}
    </div>
  )
}

const SAMPLE_POSITIONS = [
  { name: 'Closed guard top', pct: 82 },
  { name: 'Back control', pct: 64 },
  { name: 'Side control bottom', pct: 28 },
]

export function SamplePlayerCardPreview() {
  return (
    <SampleWrapper title="What your player card will look like">
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatArcGauge pct={68} label="Control" color="#3b82f6" size={56} />
        <StatArcGauge pct={75} label="Win rate" color="#F5C518" size={56} />
        <StatArcGauge pct={40} label="Sub rate" color="#818cf8" size={56} />
      </div>
      <div className="space-y-1.5">
        {SAMPLE_POSITIONS.map(p => (
          <div key={p.name}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] font-medium text-foreground/70">{p.name}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{p.pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${p.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SampleWrapper>
  )
}

export function SampleMatchCardPreview() {
  return (
    <SampleWrapper title="What an analysed match looks like">
      <div className="rounded-lg border border-border/40 bg-background/40 overflow-hidden">
        <div className="flex items-stretch">
          <div className="w-16 h-12 bg-muted/50 flex-shrink-0 flex items-center justify-center">
            <svg className="w-4 h-4 text-muted-foreground/20" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
          <div className="flex-1 px-3 py-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium">Gi Competition</span>
              <span className="text-[10px] font-medium px-1 py-0.5 rounded-sm border text-blue-500 border-blue-500/30">W · Sub</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">73% ctrl · 5m 32s · Back control</p>
          </div>
        </div>
      </div>
    </SampleWrapper>
  )
}

export function SampleTournamentPreview() {
  return (
    <SampleWrapper title="What a tournament looks like once added">
      <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold">European Open 2026</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">IBJJF</span>
            <span className="text-[10px] text-muted-foreground">Jul 12, 2026</span>
          </div>
        </div>
        <span className="text-[10px] font-bold text-amber-400 tabular-nums">28d</span>
      </div>
    </SampleWrapper>
  )
}

export function SampleGameplanPreview() {
  return (
    <SampleWrapper title="What a gameplan looks like">
      <div className="space-y-1.5 mb-3">
        <div className="flex items-end justify-between gap-2">
          <span className="text-2xl font-bold tabular-nums leading-none">68%</span>
          <span className="text-[11px] font-semibold text-blue-400 mb-0.5">Favourable</span>
        </div>
        <div className="h-1 rounded-full bg-muted/60 overflow-hidden">
          <div className="h-full rounded-full bg-blue-500/60" style={{ width: '68%' }} />
        </div>
      </div>
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] px-2.5 py-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-rose-500/60 mb-1">Danger</p>
        <p className="text-xs text-rose-400 font-medium leading-snug">Berimbolo entries from De La Riva</p>
      </div>
    </SampleWrapper>
  )
}

export function SampleGameDayPreview() {
  return (
    <SampleWrapper title="What a match-day briefing looks like">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border-l-2 border-blue-500 bg-blue-500/[0.06] px-2.5 py-2 space-y-0.5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-500">Open with</p>
          <p className="text-[11px] font-bold leading-snug">Collar drag to back take</p>
        </div>
        <div className="rounded-lg border-l-2 border-rose-500 bg-rose-500/[0.06] px-2.5 py-2 space-y-0.5">
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">Watch out</p>
          <p className="text-[11px] font-bold leading-snug text-rose-700 dark:text-rose-300">Leg-lock entries from 50-50</p>
        </div>
      </div>
    </SampleWrapper>
  )
}
