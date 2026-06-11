'use client'

import { useMemo, useState } from 'react'
import {
  DRILL_CATEGORIES,
  DIFFICULTY_LABELS,
  DIFFICULTY_BELT_RANGE,
  isRecommendedForBelt,
  type DrillCategory,
  type Difficulty,
} from '@/lib/taxonomy/drill-metadata'

export type Drill = {
  id: string
  name: string
  eventName: string
  positionName: string | null
  format: string
  visualCues: string
  counters: string | null
  sourceUrl: string | null
  category: DrillCategory
  difficulty: Difficulty
}

const PAGE_SIZE = 24

const FORMAT_LABELS: Record<string, string> = { gi: 'Gi', no_gi: 'No-Gi', both: 'Gi & No-Gi' }

const DIFFICULTY_BADGE: Record<Difficulty, string> = {
  fundamental: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  intermediate: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  advanced: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
}

function FilterPill({
  active, onClick, children, small,
}: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border transition-colors whitespace-nowrap ${small ? 'text-[11px] px-2 py-1' : 'text-xs px-3 py-1.5'} ${
        active
          ? 'bg-foreground text-background border-foreground font-medium'
          : 'border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {children}
    </button>
  )
}

function DrillCard({ drill }: { drill: Drill }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${DIFFICULTY_BADGE[drill.difficulty]}`}>
            {DIFFICULTY_LABELS[drill.difficulty]}
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground">
            {FORMAT_LABELS[drill.format] ?? drill.format}
          </span>
        </div>
        <h3 className="font-semibold text-sm leading-snug">{drill.name}</h3>
        {drill.positionName && (
          <p className="text-xs text-muted-foreground">From {drill.positionName}</p>
        )}
      </div>

      <p className={`text-xs text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
        {drill.visualCues}
      </p>
      {drill.visualCues.length > 180 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-foreground/70 hover:text-foreground underline underline-offset-2 self-start -mt-1.5"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}

      {drill.counters && (
        <div className="rounded-lg bg-foreground/[0.03] border border-border/30 px-3 py-2 space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Common counter</p>
          <p className="text-xs text-foreground/80 leading-snug line-clamp-3">{drill.counters}</p>
        </div>
      )}

      {drill.sourceUrl && (
        <a
          href={drill.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-foreground/70 hover:text-foreground inline-flex items-center gap-1 mt-auto pt-1"
        >
          Watch tutorial
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </a>
      )}
    </div>
  )
}

export function DrillLibrary({ drills, userBelt }: { drills: Drill[]; userBelt: string | null }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DrillCategory | 'all'>('all')
  const [format, setFormat] = useState<'all' | 'gi' | 'no_gi'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [recommendedOnly, setRecommendedOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<DrillCategory, number>> = {}
    for (const d of drills) counts[d.category] = (counts[d.category] ?? 0) + 1
    return counts
  }, [drills])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return drills.filter(d => {
      if (category !== 'all' && d.category !== category) return false
      if (difficulty !== 'all' && d.difficulty !== difficulty) return false
      if (format !== 'all' && d.format !== 'both' && d.format !== format) return false
      if (recommendedOnly && !isRecommendedForBelt(d.difficulty, userBelt)) return false
      if (q) {
        const haystack = `${d.name} ${d.eventName} ${d.positionName ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [drills, search, category, format, difficulty, recommendedOnly, userBelt])

  const visible = filtered.slice(0, visibleCount)
  const reset = () => setVisibleCount(PAGE_SIZE)

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Drill Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {drills.length} techniques from the RollPlan knowledge base — the same reference library the AI
          uses to spot positions and submissions in your matches.
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); reset() }}
          placeholder="Search techniques (e.g. armbar, half guard, kimura)…"
          className="w-full sm:max-w-sm rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />

        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={category === 'all'} onClick={() => { setCategory('all'); reset() }}>
            All ({drills.length})
          </FilterPill>
          {DRILL_CATEGORIES.map(c => (
            categoryCounts[c.id] ? (
              <FilterPill key={c.id} active={category === c.id} onClick={() => { setCategory(c.id); reset() }}>
                {c.label} ({categoryCounts[c.id]})
              </FilterPill>
            ) : null
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Format</span>
            {(['all', 'gi', 'no_gi'] as const).map(f => (
              <FilterPill key={f} small active={format === f} onClick={() => { setFormat(f); reset() }}>
                {f === 'all' ? 'All' : FORMAT_LABELS[f]}
              </FilterPill>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Level</span>
            {(['all', 'fundamental', 'intermediate', 'advanced'] as const).map(d => (
              <FilterPill key={d} small active={difficulty === d} onClick={() => { setDifficulty(d); reset() }}>
                {d === 'all' ? 'All' : DIFFICULTY_LABELS[d]}
              </FilterPill>
            ))}
          </div>
          {userBelt && (
            <FilterPill small active={recommendedOnly} onClick={() => { setRecommendedOnly(r => !r); reset() }}>
              Recommended for {userBelt} belt
            </FilterPill>
          )}
        </div>

        {difficulty !== 'all' && (
          <p className="text-xs text-muted-foreground/70">
            {DIFFICULTY_LABELS[difficulty]} techniques are typically taught around {DIFFICULTY_BELT_RANGE[difficulty]} belt level.
          </p>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No drills match your filters. Try clearing some.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map(d => <DrillCard key={d.id} drill={d} />)}
          </div>
          {visibleCount < filtered.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-border/60 hover:border-border hover:bg-muted/40 transition-colors"
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
