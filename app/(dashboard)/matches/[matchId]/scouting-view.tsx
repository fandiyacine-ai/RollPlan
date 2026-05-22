'use client'

import { useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { CorrectResultButton } from './correct-result-button'
import { ShareButton } from './share-button'

// ─── Types ────────────────────────────────────────────────────────────────────

type InsightRow = {
  id: string
  category: string
  severity: string
  description: string
  suggestion: string
  confidence: number
  youtubeSearchQuery: string | null
  evidenceSegmentIds: unknown
}

type TimelineItem =
  | { type: 'position'; time: number; positionName: string; dominance: string; durationSeconds: number; segmentId: string }
  | { type: 'event'; time: number; actor: string; eventName: string; techniqueLabel: string | null; outcome: string | null }

type PositionStat = { total: number; dominant: number; neutral: number; inferior: number }
type ChatMessage = { role: 'user' | 'coach'; text: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const t = Math.round(s)
  const m = Math.floor(t / 60)
  const sec = t % 60
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`
  return `${sec}s`
}

function extractYouTubeId(url: string): string | null {
  return url.match(/[?&]v=([^&]+)/)?.[1] ?? url.match(/youtu\.be\/([^?]+)/)?.[1] ?? null
}

// ─── Result Badge ──────────────────────────────────────────────────────────────

function ResultBadge({ winner, method, technique }: { winner: string; method: string | null; technique: string | null }) {
  const isWin = winner === 'user'
  const label = method === 'submission'
    ? (isWin ? `W — Sub${technique ? ` (${technique})` : ''}` : `L — Sub${technique ? ` (${technique})` : ''}`)
    : method === 'points' ? (isWin ? 'W — Points' : 'L — Points')
    : method === 'dq' ? (isWin ? 'W — DQ' : 'L — DQ')
    : method === 'walkover' ? (isWin ? 'W — Walkover' : 'L — Walkover')
    : isWin ? 'Win' : 'Loss'
  return (
    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${
      isWin
        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30'
        : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
    }`}>
      {label}
    </span>
  )
}

// ─── Scouting Brief ───────────────────────────────────────────────────────────

function ScoutingBrief({ insights, large = false }: { insights: InsightRow[]; large?: boolean }) {
  const attack = insights.find(i => i.category === 'opportunity')
  const danger =
    insights.find(i => i.category === 'mistake' && i.severity === 'critical') ??
    insights.find(i => i.category === 'mistake')
  const pattern = insights.find(i => i.category === 'pattern')

  const rows = [
    {
      label: 'ATTACK',
      content: attack?.description,
      labelColor: 'text-rose-400',
      rowBorder: 'border-rose-500/15',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-rose-400 flex-shrink-0">
          <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
        </svg>
      ),
    },
    {
      label: 'DANGER',
      content: danger?.description,
      labelColor: 'text-amber-400',
      rowBorder: 'border-amber-500/15',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-amber-400 flex-shrink-0">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
    },
    {
      label: 'PATTERN',
      content: pattern?.description,
      labelColor: 'text-zinc-400',
      rowBorder: 'border-zinc-700/30',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0">
          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
          <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
        </svg>
      ),
    },
  ]

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">Scouting Brief</span>
          <span className="text-[10px] text-amber-500/40 animate-pulse">Generating…</span>
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-3 items-center animate-pulse">
            <div className="w-16 h-2.5 bg-amber-500/15 rounded flex-shrink-0" />
            <div className="flex-1 h-2.5 bg-muted/60 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-amber-500/20 flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-amber-500">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Scouting Brief</span>
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">AI</span>
      </div>
      {rows.map(row => (
        <div key={row.label} className={`flex gap-3 px-4 py-3 border-b ${row.rowBorder} last:border-0 items-start`}>
          <div className="flex items-center gap-1.5 w-20 flex-shrink-0 pt-0.5">
            {row.icon}
            <span className={`text-[10px] font-bold uppercase tracking-widest ${row.labelColor}`}>{row.label}</span>
          </div>
          {row.content ? (
            <p className={`leading-snug text-foreground/90 ${large ? 'text-base' : 'text-sm'}`}>{row.content}</p>
          ) : (
            <p className="text-sm text-muted-foreground/40 italic">—</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Collapsible ──────────────────────────────────────────────────────────────

function Collapsible({ title, count, children, defaultOpen = false }: {
  title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors text-left"
      >
        <span className="flex items-center gap-2">
          {title}
          {count !== undefined && (
            <span className="text-xs text-muted-foreground font-normal">({count})</span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
          strokeLinecap="round" strokeLinejoin="round"
          className={`w-4 h-4 text-muted-foreground transition-transform duration-150 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div className="border-t border-border/50">{children}</div>}
    </div>
  )
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

const DOM_DOT: Record<string, string> = { dominant: 'bg-emerald-500', inferior: 'bg-rose-500', neutral: 'bg-zinc-500' }
const DOM_LABEL: Record<string, string> = { dominant: 'In control', inferior: 'Under pressure', neutral: 'Neutral' }
const DOM_TEXT: Record<string, string> = { dominant: 'text-emerald-500', inferior: 'text-rose-500', neutral: 'text-muted-foreground' }

function TimelineList({ items, onSeek, competitorLabel, opponentLabel }: {
  items: TimelineItem[]
  onSeek: (t: number) => void
  competitorLabel: string | null
  opponentLabel: string | null
}) {
  return (
    <div className="divide-y divide-border/30">
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => onSeek(item.time)}
          className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-muted/40 transition-colors"
        >
          <span className="text-[11px] font-mono text-muted-foreground w-9 flex-shrink-0 tabular-nums">
            {fmtTime(item.time)}
          </span>
          {item.type === 'position' ? (
            <>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOM_DOT[item.dominance] ?? 'bg-zinc-500'}`} />
              <span className="flex-1 text-sm font-medium min-w-0 truncate">{item.positionName}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${DOM_TEXT[item.dominance] ?? 'text-muted-foreground'}`}>
                {DOM_LABEL[item.dominance]}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 ml-1">
                {fmtTime(item.durationSeconds)}
              </span>
            </>
          ) : (
            <>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.actor === 'user' ? 'bg-blue-400' : 'bg-orange-400'}`} />
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                item.actor === 'user' ? 'bg-blue-950 text-blue-400' : 'bg-orange-950 text-orange-400'
              }`}>
                {item.actor === 'user' ? (competitorLabel ?? 'You') : (opponentLabel ?? 'Opp')}
              </span>
              <span className="flex-1 text-sm font-medium min-w-0 truncate">{item.eventName}</span>
              {item.techniqueLabel && (
                <span className="text-xs italic text-muted-foreground flex-shrink-0 hidden sm:inline">{item.techniqueLabel}</span>
              )}
              {item.outcome && (
                <span className="text-xs text-muted-foreground flex-shrink-0 capitalize">{item.outcome}</span>
              )}
            </>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Insight Cards (within coaching notes accordion) ──────────────────────────

const CAT_ACCENT: Record<string, { color: string; pill: string }> = {
  strength:    { color: '#10b981', pill: 'bg-emerald-500/15 text-emerald-400' },
  mistake:     { color: '#f43f5e', pill: 'bg-rose-500/15 text-rose-400' },
  opportunity: { color: '#3b82f6', pill: 'bg-blue-500/15 text-blue-400' },
  pattern:     { color: '#f59e0b', pill: 'bg-amber-500/15 text-amber-400' },
}
const SEV_PILL: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-400',
  moderate: 'bg-amber-500/15 text-amber-400',
  minor:    'bg-zinc-500/15 text-zinc-400',
}

function InsightCard({ insight }: { insight: InsightRow }) {
  const accent = CAT_ACCENT[insight.category]
  const color = accent?.color ?? '#71717a'
  return (
    <div
      className="px-4 py-3 border-b border-border/40 last:border-0"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-widest capitalize" style={{ color }}>
          {insight.category}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${SEV_PILL[insight.severity] ?? 'bg-zinc-500/15 text-zinc-400'}`}>
          {insight.severity}
        </span>
      </div>
      <p className="text-sm font-semibold leading-snug">{insight.description}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.suggestion}</p>
      {insight.youtubeSearchQuery && (
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(insight.youtubeSearchQuery)}`}
          target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium mt-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          Drill on YouTube
        </a>
      )}
    </div>
  )
}

// ─── Embedded Chat ────────────────────────────────────────────────────────────

function EmbeddedChat({ matchId, currentTime }: { matchId: string; currentTime: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, message: text, currentTimestampSeconds: currentTime }),
      })
      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'coach', text: 'Something went wrong. Try again.' }])
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = ''
      setMessages(prev => [...prev, { role: 'coach', text: '' }])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += dec.decode(value, { stream: true })
        setMessages(prev => [...prev.slice(0, -1), { role: 'coach', text: full }])
      }
    } finally {
      setLoading(false)
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [matchId, currentTime, loading])

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="overflow-y-auto space-y-2.5 p-3 max-h-44 min-h-[52px]">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 italic">Ask about any moment in this footage…</p>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span className={`inline-block text-sm px-3 py-1.5 rounded-xl max-w-[95%] text-left leading-snug ${
                m.role === 'user' ? 'bg-foreground text-background' : 'bg-muted text-foreground'
              }`}>
                {m.text || (loading && m.role === 'coach' ? '…' : '')}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={e => { e.preventDefault(); send(input); setInput('') }}
        className="border-t border-border/40 flex items-center gap-2 px-3 py-2 flex-shrink-0"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about this opponent…"
          className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground/40 min-w-0"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="text-xs px-3 py-1.5 bg-foreground text-background rounded-lg disabled:opacity-40 transition-opacity flex-shrink-0"
        >
          {loading ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScoutingView({
  match,
  videoUrl,
  insights,
  timelineItems,
  sortedPositions,
  maxPositionTime,
  positionNames,
  backHref,
}: {
  match: {
    id: string
    competitorLabel: string | null
    opponentLabel: string | null
    format: string
    context: string
    eventName: string | null
    resultWinner: string | null
    resultMethod: string | null
    resultTechnique: string | null
  }
  videoUrl: string | null
  insights: InsightRow[]
  timelineItems: TimelineItem[]
  sortedPositions: [string, PositionStat][]
  maxPositionTime: number
  positionNames: Record<string, string>
  backHref: string
}) {
  const [currentTime, setCurrentTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const ytId = videoUrl ? extractYouTubeId(videoUrl) : null

  const seekTo = useCallback((seconds: number) => {
    if (ytId) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [Math.max(0, seconds - 1.5), true] }), '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
      )
    } else if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, seconds - 1.5)
      videoRef.current.play().catch(() => {})
    }
    setCurrentTime(seconds)
  }, [ytId])

  const opponentName =
    match.opponentLabel && match.opponentLabel.toLowerCase() !== 'unknown'
      ? match.opponentLabel
      : 'Unknown Opponent'

  const top5Positions = sortedPositions.slice(0, 5).map(([posId, stats]) => ({
    name: positionNames[posId] ?? posId,
    stats,
  }))

  const VideoBlock = ({ className }: { className?: string }) => (
    <div className={`rounded-xl overflow-hidden bg-black border border-border/60 ${className ?? ''}`}>
      {ytId ? (
        <div className="aspect-video">
          <iframe
            ref={iframeRef}
            src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`}
            className="w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>
      ) : videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          playsInline
          className="w-full max-h-[42vh] object-contain"
          preload="metadata"
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        />
      ) : (
        <div className="aspect-video flex items-center justify-center text-sm text-muted-foreground">
          No video available
        </div>
      )}
    </div>
  )

  const PositionBarsBlock = () => (
    <div className="rounded-xl border border-border/60 p-3 space-y-2 flex-shrink-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="w-3 h-3 opacity-50">
          <circle cx="6" cy="6" r="4.5"/><path d="M6 3.5v2.5l1.5 1"/>
        </svg>
        Time on Mat
      </p>
      {top5Positions.map(({ name, stats }) => {
        const barPct = (stats.total / maxPositionTime) * 100
        const domPct = (stats.dominant / stats.total) * 100
        const infPct = (stats.inferior / stats.total) * 100
        const neuPct = Math.max(0, 100 - domPct - infPct)
        return (
          <div key={name}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-medium">{name}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(stats.total)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${barPct}%` }}>
                <div className="bg-emerald-500" style={{ width: `${domPct}%` }} />
                <div className="bg-zinc-600" style={{ width: `${neuPct}%` }} />
                <div className="bg-rose-400" style={{ width: `${infPct}%` }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">

      {/* ── Header ── */}
      <div className="flex items-start justify-between pb-3 border-b flex-shrink-0 gap-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Scout Opponent
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
            <h1 className="text-lg font-bold">{opponentName}</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25 flex-shrink-0 tracking-wide uppercase">
              Scouting
            </span>
            {match.resultWinner && (
              <ResultBadge
                winner={match.resultWinner}
                method={match.resultMethod}
                technique={match.resultTechnique}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {match.format === 'no_gi' ? 'No-Gi' : 'Gi'} · {match.context}
            {match.eventName ? ` · ${match.eventName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-5">
          <CorrectResultButton matchId={match.id} />
          <ShareButton matchId={match.id} />
        </div>
      </div>

      {/* ── Desktop: two-panel ── */}
      <div className="hidden md:flex flex-1 overflow-hidden gap-4 pt-4">

        {/* Left — sticky: video + position bars + chat */}
        <div className="flex flex-col w-[52%] flex-shrink-0 overflow-hidden gap-3">
          <VideoBlock className="flex-shrink-0" />
          {top5Positions.length > 0 && <PositionBarsBlock />}
          <div className="flex-1 min-h-0" />
          {/* Chat */}
          <div className="flex-shrink-0 rounded-xl border border-border/60 bg-card overflow-hidden">
            <div className="px-3 py-2 border-b border-border/40 flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-muted-foreground">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ask about this match</span>
            </div>
            <EmbeddedChat matchId={match.id} currentTime={currentTime} />
          </div>
        </div>

        {/* Right — scrollable: brief + timeline + coaching notes */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          <ScoutingBrief insights={insights} />
          <Collapsible title="Timeline" count={timelineItems.length} defaultOpen>
            <TimelineList
              items={timelineItems}
              onSeek={seekTo}
              competitorLabel={match.competitorLabel}
              opponentLabel={match.opponentLabel}
            />
          </Collapsible>
          <Collapsible title="Coaching Notes" count={insights.length}>
            {insights.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </Collapsible>
        </div>
      </div>

      {/* ── Mobile: stacked, brief first ── */}
      <div className="md:hidden flex-1 overflow-y-auto space-y-3 pt-4 pb-24">
        {/* Brief — always visible, large for arena readability */}
        <ScoutingBrief insights={insights} large />

        {/* Video — collapsed by default */}
        <Collapsible title="Watch footage">
          <div className="p-2">
            <VideoBlock />
          </div>
        </Collapsible>

        {/* Position bars */}
        {top5Positions.length > 0 && (
          <Collapsible title="Time on Mat">
            <div className="p-3">
              <PositionBarsBlock />
            </div>
          </Collapsible>
        )}

        {/* Timeline */}
        <Collapsible title="Timeline" count={timelineItems.length}>
          <TimelineList
            items={timelineItems}
            onSeek={seekTo}
            competitorLabel={match.competitorLabel}
            opponentLabel={match.opponentLabel}
          />
        </Collapsible>

        {/* Coaching Notes */}
        <Collapsible title="Coaching Notes" count={insights.length}>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </Collapsible>

        {/* Chat */}
        <Collapsible title="Ask AI">
          <EmbeddedChat matchId={match.id} currentTime={currentTime} />
        </Collapsible>
      </div>

    </div>
  )
}
