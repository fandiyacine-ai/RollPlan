'use client'

import React, { useRef, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { CorrectResultButton } from './correct-result-button'
import { ShareButton } from './share-button'
import { EVENT_TYPES } from '../../../../lib/taxonomy/events'
import { correctPosition } from './actions'
import { POSITIONS } from '../../../../lib/taxonomy/positions'

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
type TabId = 'brief' | 'timeline' | 'notes' | 'stats' | 'prediction' | 'ask'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  const t = Math.round(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  if (h > 0) return sec > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${h}h ${m}m` : `${h}h`
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
        ? 'bg-blue-950/60 text-blue-400 border border-blue-800/30'
        : 'bg-rose-950/60 text-rose-400 border border-rose-800/30'
    }`}>
      {label}
    </span>
  )
}

// ─── TL;DR chips — match-day quick-read strip ─────────────────────────────────

function tldrText(text: string | undefined): string | null {
  if (!text) return null
  const words = text.split(/\s+/)
  return words.slice(0, 6).join(' ') + (words.length > 6 ? '…' : '')
}

function TldrChips({ insights }: { insights: InsightRow[] }) {
  const attack = insights.find(i => i.category === 'opportunity')
  const danger =
    insights.find(i => i.category === 'mistake' && i.severity === 'critical') ??
    insights.find(i => i.category === 'mistake')
  const pattern = insights.find(i => i.category === 'pattern')

  if (!attack && !danger && !pattern) return null

  return (
    <div className="flex flex-wrap gap-2 px-3 py-2.5">
      {tldrText(attack?.description) && (
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 leading-none">
          ↗ {tldrText(attack?.description)}
        </span>
      )}
      {tldrText(danger?.description) && (
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 leading-none">
          ⚠ {tldrText(danger?.description)}
        </span>
      )}
      {tldrText(pattern?.description) && (
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 leading-none">
          ↻ {tldrText(pattern?.description)}
        </span>
      )}
    </div>
  )
}

// ─── Tab: Scouting Brief ──────────────────────────────────────────────────────

function BriefTab({ insights, narration, narratingAuto, onRegenerateNarration, large = false }: {
  insights: InsightRow[]
  narration?: string | null
  narratingAuto?: boolean
  onRegenerateNarration?: () => void
  large?: boolean
}) {
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
      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground/50 animate-pulse">Generating brief…</p>
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-3 items-center animate-pulse">
            <div className="w-16 h-2.5 bg-muted rounded flex-shrink-0" />
            <div className="flex-1 h-2.5 bg-muted/60 rounded" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/40">
      {rows.map(row => (
        <div key={row.label} className={`flex gap-3 px-4 py-4 items-start ${row.rowBorder}`}>
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

      {/* Match narration — auto-generated summary */}
      {narratingAuto && !narration && (
        <div className="px-4 py-3 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground/40 animate-pulse">Writing match report…</p>
        </div>
      )}
      {narration && (
        <div className="px-4 py-3 border-t border-border/30">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Match report</p>
            {onRegenerateNarration && (
              <button
                onClick={onRegenerateNarration}
                className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                Regenerate
              </button>
            )}
          </div>
          <div className="text-muted-foreground/80"><MarkdownMessage text={narration} compact /></div>
        </div>
      )}
    </div>
  )
}

// ─── Records comparison widget (shown in Brief tab for scouting matches) ───────

type IntelRecord = {
  ajpWins: number | null; ajpLosses: number | null; ajpProfileUrl: string | null
  smoothcompWins: number | null; smoothcompLosses: number | null; smoothcompFedUrl: string | null
  ibjjfBestResult: string | null; ibjjfProfileUrl: string | null
}

function RecordColumn({ label, intel }: { label: string; intel: IntelRecord | null | undefined }) {
  const hasData = intel && (intel.ajpWins !== null || intel.smoothcompWins !== null || intel.ibjjfBestResult)
  const MEDAL_COLOR: Record<string, string> = { Gold: 'text-yellow-400', Silver: 'text-zinc-300', Bronze: 'text-amber-500' }

  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">{label}</p>
      {!hasData ? (
        <p className="text-[11px] text-muted-foreground/40 italic">No record found</p>
      ) : (
        <>
          {intel.ajpWins !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold px-1 py-px rounded border bg-orange-900/50 text-orange-300 border-orange-700/40">AJP</span>
              <span className="text-xs tabular-nums">
                <span className="font-bold text-blue-400">{intel.ajpWins}W</span>
                <span className="text-muted-foreground/50 mx-0.5">–</span>
                <span className="font-bold text-rose-400">{intel.ajpLosses ?? 0}L</span>
              </span>
            </div>
          )}
          {intel.smoothcompWins !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold px-1 py-px rounded border bg-sky-900/50 text-sky-300 border-sky-700/40">SC</span>
              <span className="text-xs tabular-nums">
                <span className="font-bold text-blue-400">{intel.smoothcompWins}W</span>
                <span className="text-muted-foreground/50 mx-0.5">–</span>
                <span className="font-bold text-rose-400">{intel.smoothcompLosses ?? 0}L</span>
              </span>
            </div>
          )}
          {intel.ibjjfBestResult && intel.ibjjfBestResult.split('|').slice(0, 2).map((m, i) => {
            const medalLabel = m.split(' – ')[0] ?? ''
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[8px] font-bold px-1 py-px rounded border bg-violet-900/50 text-violet-300 border-violet-700/40">IBJJF</span>
                <span className={`text-xs font-semibold truncate ${MEDAL_COLOR[medalLabel] ?? 'text-muted-foreground'}`}>{m}</span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function RecordsComparison({ opponentLabel, opponentIntel, userIntel }: {
  opponentLabel: string
  opponentIntel: IntelRecord | null | undefined
  userIntel: IntelRecord | null | undefined
}) {
  const hasAny = (intel: IntelRecord | null | undefined) =>
    intel && (intel.ajpWins !== null || intel.smoothcompWins !== null || intel.ibjjfBestResult)
  if (!hasAny(opponentIntel) && !hasAny(userIntel)) return null

  return (
    <div className="border-t border-border/40 px-4 py-3">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground/40 mb-3">Competition Records</p>
      <div className="grid grid-cols-2 gap-4">
        <RecordColumn label={opponentLabel} intel={opponentIntel} />
        <RecordColumn label="You" intel={userIntel} />
      </div>
    </div>
  )
}

// ─── Tab: Timeline ────────────────────────────────────────────────────────────

const DOM_DOT: Record<string, string> = { dominant: 'bg-blue-500', inferior: 'bg-rose-500', neutral: 'bg-zinc-500' }
const DOM_LABEL: Record<string, string> = { dominant: 'In control', inferior: 'Under pressure', neutral: 'Neutral' }
const DOM_TEXT: Record<string, string> = { dominant: 'text-blue-500', inferior: 'text-rose-500', neutral: 'text-muted-foreground' }

function TimelineTab({ items, onSeek, competitorLabel, opponentLabel, onCorrectPosition }: {
  items: TimelineItem[]
  onSeek: (t: number) => void
  competitorLabel: string | null
  opponentLabel: string | null
  onCorrectPosition?: (segmentId: string, newPositionId: string) => Promise<void>
}) {
  const [correctingId, setCorrectingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleCorrect(segmentId: string, newId: string) {
    if (!onCorrectPosition) return
    setSaving(true)
    await onCorrectPosition(segmentId, newId)
    setSaving(false)
    setCorrectingId(null)
  }

  return (
    <div className="divide-y divide-border/30">
      {items.map((item, i) => {
        const isCorrecting = item.type === 'position' && correctingId === item.segmentId
        return (
          <div
            key={i}
            className={`group relative flex items-center gap-3 px-4 py-2.5 transition-colors ${!isCorrecting ? 'hover:bg-muted/40 cursor-pointer' : ''}`}
            onClick={isCorrecting ? undefined : () => onSeek(item.time)}
          >
            <span className="text-[11px] font-mono text-muted-foreground w-9 flex-shrink-0 tabular-nums">
              {fmtTime(item.time)}
            </span>
            {item.type === 'position' ? (
              <>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOM_DOT[item.dominance] ?? 'bg-zinc-500'}`} />
                <span className="flex-1 text-sm font-medium min-w-0 truncate">{item.positionName}</span>
                {!isCorrecting && (
                  <>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 ${DOM_TEXT[item.dominance] ?? 'text-muted-foreground'}`}>
                      {DOM_LABEL[item.dominance]}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0 ml-1">
                      {fmtTime(item.durationSeconds)}
                    </span>
                  </>
                )}
                {onCorrectPosition && !isCorrecting && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setCorrectingId(item.segmentId) }}
                    className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/80 group-hover:opacity-100 opacity-30 transition-all flex-shrink-0 ml-1 leading-none"
                    title="Correct this position"
                  >
                    Wrong?
                  </button>
                )}
                {isCorrecting && (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <select
                      className="text-xs rounded border border-input bg-background px-2 py-1 focus:outline-none"
                      defaultValue={POSITIONS.find(p => p.name === item.positionName)?.id ?? ''}
                      onChange={e => handleCorrect(item.segmentId, e.target.value)}
                      disabled={saving}
                    >
                      <option value="" disabled>Pick correct position…</option>
                      {POSITIONS.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setCorrectingId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
                  </div>
                )}
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
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab: Coaching Notes ──────────────────────────────────────────────────────

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

function NotesTab({ insights }: { insights: InsightRow[] }) {
  if (insights.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No coaching notes generated yet.</p>
  }
  return (
    <div>
      {insights.map(insight => {
        const color = CAT_ACCENT[insight.category]?.color ?? '#71717a'
        return (
          <div
            key={insight.id}
            className="px-4 py-3.5 border-b border-border/40 last:border-0"
            style={{ borderLeft: `3px solid ${color}` }}
          >
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-widest capitalize" style={{ color }}>
                {insight.category}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${SEV_PILL[insight.severity] ?? 'bg-zinc-500/15 text-zinc-400'}`}>
                {insight.severity}
              </span>
              <span className="ml-auto flex items-center gap-0.5" title={`Confidence: ${Math.round(insight.confidence * 100)}%`}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className={`w-1 h-1 rounded-full ${i < Math.ceil(insight.confidence * 3) ? 'bg-foreground/40' : 'bg-muted-foreground/15'}`}
                  />
                ))}
              </span>
            </div>
            <p className="text-sm font-semibold leading-snug">{insight.description}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.suggestion}</p>
            {insight.youtubeSearchQuery && (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(insight.youtubeSearchQuery)}`}
                target="_blank" rel="noopener noreferrer"
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
      })}
    </div>
  )
}

// ─── Tab: Stats ───────────────────────────────────────────────────────────────

const SUBMISSION_PARENT_IDS = new Set([
  'armbar','kimura','omoplata','wrist_lock','bicep_slicer','joint_lock_other',
  'triangle','rear_naked_choke','guillotine','darce','anaconda_choke',
  'north_south_choke','ezekiel_choke','von_flue_choke','twister',
  'baseball_bat_choke','clock_choke','paper_cutter_choke','choke_other',
  'heel_hook','kneebar','toe_hold','calf_slicer','leg_lock_other',
])

type SubAttempt = { technique: string; actor: string; outcome: string | null; position: string | null }
type SubGroup = { technique: string; attempts: SubAttempt[] }

function StatArcGauge({ pct, pressurePct }: { pct: number; pressurePct: number }) {
  const cx = 56, cy = 56
  const R = 44, r2 = 34
  const C1 = 2 * Math.PI * R
  const C2 = 2 * Math.PI * r2
  const fill1 = (C1 * pct / 100).toFixed(2)
  const gap1 = (C1 * (1 - pct / 100)).toFixed(2)
  const fill2 = (C2 * pressurePct / 100).toFixed(2)
  const gap2 = (C2 * (1 - pressurePct / 100)).toFixed(2)
  const gaugeColor = pct >= 55 ? '#3b82f6' : pct < 38 ? '#f87171' : '#818cf8'
  return (
    <svg width={112} height={112} viewBox="0 0 112 112" className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={gaugeColor} strokeWidth={16} opacity={0.07} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/30" />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={gaugeColor} strokeWidth={6}
        strokeDasharray={`${fill1} ${gap1}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="currentColor" strokeWidth={4} className="text-muted/20" />
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke="#f87171" strokeWidth={4}
        strokeDasharray={`${fill2} ${gap2}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={52} textAnchor="middle" fontSize={20} fontWeight={900} fill={gaugeColor}
        style={{ fontFamily: 'system-ui, sans-serif' }}>{pct}%</text>
      <text x={cx} y={63} textAnchor="middle" fontSize={6.5} fill="currentColor" opacity={0.35}
        style={{ fontFamily: 'system-ui, sans-serif' }}>control</text>
      {pressurePct > 0 && (
        <text x={cx} y={73} textAnchor="middle" fontSize={6} fill="#f87171" opacity={0.6}
          style={{ fontFamily: 'system-ui, sans-serif' }}>{pressurePct}% pressure</text>
      )}
    </svg>
  )
}

function StatsTab({ sortedPositions, maxPositionTime, positionNames, timelineItems, scoutedName }: {
  sortedPositions: [string, PositionStat][]
  maxPositionTime: number
  positionNames: Record<string, string>
  timelineItems: TimelineItem[]
  scoutedName?: string
}) {
  // ── Submission attempts ─────────────────────────────────────────────────────
  const SUB_REGEX = /armbar|kimura|omoplata|triangle|choke|heel.?hook|kneebar|toe.?hold|calf.?slic|guillotine|d'arce|darce|anaconda|twister|wrist|bicep|rnc|rear.?naked/i
  const isSubmission = (eventName: string, techniqueLabel: string | null) =>
    SUBMISSION_PARENT_IDS.has(eventName.toLowerCase().replace(/\s+/g, '_')) ||
    SUB_REGEX.test(eventName) ||
    (techniqueLabel !== null && (SUBMISSION_PARENT_IDS.has(techniqueLabel.toLowerCase().replace(/\s+/g, '_')) || SUB_REGEX.test(techniqueLabel)))

  const normalizeTechnique = (eventName: string, techniqueLabel: string | null): string => {
    const raw = techniqueLabel ?? eventName
    // Map raw → canonical display name from taxonomy when possible
    const normalized = raw.toLowerCase().replace(/\s+/g, '_')
    const match = EVENT_TYPES.find(e => e.id === normalized || e.aliases?.some(a => a.toLowerCase().replace(/\s+/g, '_') === normalized))
    return match?.name ?? (raw.charAt(0).toUpperCase() + raw.slice(1))
  }

  const posSegs = timelineItems.filter((i): i is Extract<TimelineItem, { type: 'position' }> => i.type === 'position')
  const posAtTime = (t: number): string | null => {
    const seg = posSegs.find(s => s.time <= t && s.time + s.durationSeconds >= t)
    return seg?.positionName ?? null
  }

  const subAttempts: SubAttempt[] = timelineItems
    .filter((item): item is Extract<TimelineItem, { type: 'event' }> => item.type === 'event')
    .filter(item => isSubmission(item.eventName, item.techniqueLabel))
    .map(item => ({ technique: normalizeTechnique(item.eventName, item.techniqueLabel), actor: item.actor, outcome: item.outcome, position: posAtTime(item.time) }))

  const subByTechnique = new Map<string, SubAttempt[]>()
  for (const a of subAttempts) {
    const key = a.technique
    if (!subByTechnique.has(key)) subByTechnique.set(key, [])
    subByTechnique.get(key)!.push(a)
  }
  const subGroups: SubGroup[] = Array.from(subByTechnique.entries())
    .map(([technique, attempts]) => ({ technique, attempts }))
    .sort((a, b) => b.attempts.length - a.attempts.length)

  // ── Positional events ───────────────────────────────────────────────────────
  const positionalEvents = timelineItems
    .filter((item): item is Extract<TimelineItem, { type: 'event' }> => item.type === 'event')
    .filter(item => !isSubmission(item.eventName, item.techniqueLabel))

  const sweepCount    = positionalEvents.filter(e => /sweep/i.test(e.eventName)).length
  const passCount     = positionalEvents.filter(e => /pass/i.test(e.eventName)).length
  const takedownCount = positionalEvents.filter(e => /takedown/i.test(e.eventName)).length

  const allTimes = timelineItems.map(i => i.time)
  const matchDuration = allTimes.length > 1 ? Math.max(...allTimes) - Math.min(...allTimes) : 0

  // ── Control stats ───────────────────────────────────────────────────────────
  const totalTime     = sortedPositions.reduce((sum, [, s]) => sum + s.total, 0)
  const totalDominant = sortedPositions.reduce((sum, [, s]) => sum + s.dominant, 0)
  const totalInferior = sortedPositions.reduce((sum, [, s]) => sum + s.inferior, 0)
  const controlPct    = totalTime > 0 ? Math.round(totalDominant / totalTime * 100) : 0
  const pressurePct   = totalTime > 0 ? Math.round(totalInferior / totalTime * 100) : 0

  // ── Arsenal / Exposed ───────────────────────────────────────────────────────
  const posStats = sortedPositions
    .map(([id, s]) => ({
      name: positionNames[id] ?? id,
      dominantPct: s.total > 0 ? s.dominant / s.total : 0,
      inferiorPct: s.total > 0 ? s.inferior / s.total : 0,
      total: s.total,
    }))
    .filter(p => p.total > 0)

  const strongPositions = posStats.filter(p => p.dominantPct > 0).sort((a, b) => b.dominantPct - a.dominantPct).slice(0, 3)
  const weakPositions   = posStats.filter(p => p.inferiorPct > 0).sort((a, b) => b.inferiorPct - a.inferiorPct).slice(0, 3)

  const quickStats = [
    ...(matchDuration > 0 ? [{ label: 'Time', value: fmtTime(matchDuration) }] : []),
    { label: 'Subs', value: String(subAttempts.length) },
    ...(sweepCount > 0    ? [{ label: 'Sweeps',  value: String(sweepCount)    }] : []),
    ...(passCount > 0     ? [{ label: 'Passes',  value: String(passCount)     }] : []),
    ...(takedownCount > 0 ? [{ label: 'Takedown', value: String(takedownCount) }] : []),
  ]

  return (
    <div className="px-4 py-3 space-y-3">

      {/* ── Row 1: gauge + quick stat chips ── */}
      <div className="flex items-center gap-3">
        <StatArcGauge pct={controlPct} pressurePct={pressurePct} />
        <div className="flex flex-wrap gap-2 flex-1">
          {quickStats.map(stat => (
            <div key={stat.label} className="rounded-lg border border-border/40 bg-muted/30 px-3 py-1.5 min-w-[60px]">
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 leading-none mb-0.5">{stat.label}</div>
              <div className="text-sm font-bold tabular-nums text-foreground leading-tight">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 2: Arsenal / Exposed ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
          <div className="text-[8px] font-bold uppercase tracking-widest text-blue-500 mb-0.5">Arsenal</div>
          <div className="text-[9px] text-blue-500/50 mb-2">positions in control</div>
          {strongPositions.length > 0 ? strongPositions.map(pos => {
            const pct = Math.round(pos.dominantPct * 100)
            return (
              <div key={pos.name} className="mb-1.5">
                <div className="flex justify-between items-baseline mb-0.5 gap-1">
                  <span className="text-[10px] text-foreground/80 font-medium truncate">{pos.name}</span>
                  <span className="text-[10px] text-blue-500 font-bold flex-shrink-0">{pct}%</span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          }) : <p className="text-[10px] text-muted-foreground/40 italic">None yet</p>}
        </div>

        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5">
          <div className="text-[8px] font-bold uppercase tracking-widest text-rose-500 mb-0.5">Exposed</div>
          <div className="text-[9px] text-rose-500/50 mb-2">positions under pressure</div>
          {weakPositions.length > 0 ? weakPositions.map(pos => {
            const pct = Math.round(pos.inferiorPct * 100)
            return (
              <div key={pos.name} className="mb-1.5">
                <div className="flex justify-between items-baseline mb-0.5 gap-1">
                  <span className="text-[10px] text-foreground/80 font-medium truncate">{pos.name}</span>
                  <span className="text-[10px] text-rose-500 font-bold flex-shrink-0">{pct}%</span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          }) : <p className="text-[10px] text-muted-foreground/40 italic">None yet</p>}
        </div>
      </div>

      {/* ── Row 3: Submission attempts ── */}
      {subGroups.length > 0 && (
        <div>
          <p className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Submission Attempts</p>
          <div className="space-y-1.5">
            {subGroups.map(({ technique, attempts }) => {
              const oppAttempts  = attempts.filter(a => a.actor !== 'user')
              const userAttempts = attempts.filter(a => a.actor === 'user')
              const isOppThreat  = oppAttempts.length > 0
              return (
                <div key={technique} className={`rounded-lg border px-3 py-2 ${isOppThreat ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/40 bg-muted/20'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-foreground/90">{technique}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isOppThreat ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                      {attempts.length}×
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {oppAttempts.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] text-amber-500/70 font-medium w-12 flex-shrink-0 pt-0.5">Opp</span>
                        <div className="flex flex-wrap gap-1">
                          {oppAttempts.map((a, i) => (
                            <span key={i} title={[a.outcome ?? 'attempted', a.position].filter(Boolean).join(' · ')}
                              className="inline-flex items-center gap-0.5">
                              <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 ${a.outcome === 'successful' ? 'bg-amber-500 border-amber-500' : 'bg-transparent border-amber-500/50'}`} />
                              {a.position && <span className="text-[8px] text-amber-500/50 leading-none">{a.position}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {userAttempts.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-[9px] text-muted-foreground/60 font-medium w-12 flex-shrink-0 pt-0.5">{scoutedName ?? 'You'}</span>
                        <div className="flex flex-wrap gap-1">
                          {userAttempts.map((a, i) => (
                            <span key={i} title={[a.outcome ?? 'attempted', a.position].filter(Boolean).join(' · ')}
                              className="inline-flex items-center gap-0.5">
                              <span className={`w-2.5 h-2.5 rounded-full border flex-shrink-0 ${a.outcome === 'successful' ? 'bg-violet-400 border-violet-400' : 'bg-transparent border-violet-400/50'}`} />
                              {a.position && <span className="text-[8px] text-muted-foreground/40 leading-none">{a.position}</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Tab: Prediction ─────────────────────────────────────────────────────────

function PredictionTab({ insights, opponentName, hasOwnFootage }: { insights: InsightRow[]; opponentName: string; hasOwnFootage?: boolean }) {
  const patterns = insights.filter(i => i.category === 'pattern')
  const strengths = insights.filter(i => i.category === 'strength')

  return (
    <div className="p-4 space-y-5">
      {/* Footage invite — recruitment opportunity, only relevant if the user hasn't uploaded their own footage yet */}
      {!hasOwnFootage && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5 text-amber-400">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-tight">
                Your prediction could be sharper
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We know {opponentName}'s tendencies inside out — but a real matchup prediction means comparing their game against <em>yours</em>. Right now we're only seeing half the picture.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">
              Unlock with your footage
            </p>
            {[
              'Win probability based on your actual positions',
              'Where their attacks meet your defence',
              'Your submission entries vs. their guard patterns',
            ].map((benefit, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {benefit}
              </div>
            ))}
          </div>

          <a
            href="/matches"
            className="flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors w-full"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload my footage
          </a>
        </div>
      )}

      {/* What we do know about the opponent */}
      {strengths.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            What {opponentName} does well
          </p>
          {strengths.slice(0, 3).map(s => (
            <div key={s.id} className="text-sm text-foreground/80 leading-snug pl-4 border-l border-border/60">
              {s.description}
            </div>
          ))}
        </div>
      )}

      {patterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Observed tendencies
          </p>
          {patterns.slice(0, 3).map(p => (
            <div key={p.id} className="text-sm text-foreground/80 leading-snug pl-4 border-l border-border/60">
              {p.description}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Embedded Chat ────────────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  'What positions does this opponent favour?',
  'Where are they most dangerous?',
  'What patterns repeat across the match?',
  'How do they react under pressure?',
]

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
      : p
  )
}

// Renders both chat (## headers, - bullets, **bold**) and narration (ALL-CAPS headers, • bullets)
function MarkdownMessage({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let bulletBuffer: string[] = []
  const textSm = compact ? 'text-xs' : 'text-sm'

  function flushBullets() {
    if (bulletBuffer.length === 0) return
    nodes.push(
      <ul key={`ul-${nodes.length}`} className="mt-1 space-y-1">
        {bulletBuffer.map((b, i) => (
          <li key={i} className={`flex gap-1.5 ${textSm} leading-snug`}>
            <span className="text-foreground/40 flex-shrink-0 mt-0.5">–</span>
            <span>{renderInline(b)}</span>
          </li>
        ))}
      </ul>
    )
    bulletBuffer = []
  }

  const isAllCapsHeader = (s: string) => s.length > 2 && s === s.toUpperCase() && /^[A-Z][A-Z\s]+$/.test(s)

  for (const raw of lines) {
    const line = raw.trimStart()
    if (line.startsWith('## ')) {
      flushBullets()
      nodes.push(
        <p key={nodes.length} className="text-[11px] font-bold uppercase tracking-wider text-foreground/50 mt-3 mb-0.5 first:mt-0">
          {line.slice(3)}
        </p>
      )
    } else if (isAllCapsHeader(line)) {
      flushBullets()
      nodes.push(
        <p key={nodes.length} className="text-[11px] font-bold uppercase tracking-wider text-foreground/50 mt-3 mb-0.5 first:mt-0">
          {line}
        </p>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      bulletBuffer.push(line.slice(2))
    } else if (line === '') {
      flushBullets()
    } else {
      flushBullets()
      nodes.push(
        <p key={nodes.length} className={`${textSm} leading-relaxed`}>{renderInline(line)}</p>
      )
    }
  }
  flushBullets()

  return <div className="space-y-1">{nodes}</div>
}

function AskTab({ matchId, currentTime, opponentName, videoRef, contextInsights }: {
  matchId: string
  currentTime: number
  opponentName: string
  videoRef?: React.RefObject<HTMLVideoElement | null>
  contextInsights?: InsightRow[]
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendFrame, setSendFrame] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)

  // Only works for uploaded videos — YouTube embeds are cross-origin
  const canCapture = !!videoRef

  function captureFrame(): string | null {
    const el = videoRef?.current
    if (!el || el.readyState < 2) return null
    try {
      const maxW = 1280
      const scale = Math.min(1, maxW / el.videoWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(el.videoWidth * scale)
      canvas.height = Math.round(el.videoHeight * scale)
      canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.75)
    } catch {
      return null
    }
  }

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const frameDataUrl = canCapture && sendFrame ? captureFrame() : null
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          message: text,
          currentTimestampSeconds: currentTime,
          mode: 'scouting',
          ...(frameDataUrl ? { frameDataUrl } : {}),
        }),
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, currentTime, loading, sendFrame, canCapture])

  return (
    <div className="flex flex-col h-full">
      {/* Clear button — only shown when a conversation exists */}
      {messages.length > 0 && (
        <div className="flex items-center justify-end px-3 pt-2 pb-1 flex-shrink-0">
          <button
            onClick={() => setMessages([])}
            className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground/80 transition-colors flex items-center gap-1"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            New chat
          </button>
        </div>
      )}

      {/* Messages / empty state */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 px-1 py-2">
            {/* Context brief — what the AI already knows */}
            {contextInsights && contextInsights.length > 0 && (
              <div className="rounded-xl border border-[#F5C518]/20 bg-[#F5C518]/5 px-3.5 py-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#F5C518] flex-shrink-0">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                  </svg>
                  <p className="text-[11px] font-semibold text-[#F5C518]">I've analysed {opponentName}'s footage</p>
                </div>
                <ul className="space-y-1.5">
                  {contextInsights.slice(0, 3).map((ins, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground/80 leading-snug">
                      <span className="text-[#F5C518]/50 flex-shrink-0 mt-px">·</span>
                      <span>{ins.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Suggested questions */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 px-1">Ask anything</p>
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border transition-colors text-foreground/70 hover:text-foreground"
                >
                  {q}
                </button>
              ))}
              {canCapture && (
                <p className="text-[10px] text-muted-foreground/40 px-1 pt-1">
                  Pause the video and ask — the AI will see the frame.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                {m.role === 'user' ? (
                  <span className="inline-block text-sm px-3 py-2 rounded-xl max-w-[90%] leading-snug bg-foreground text-background">
                    {m.text}
                  </span>
                ) : (
                  <div className="px-3 py-2.5 rounded-xl max-w-[90%] bg-muted text-foreground">
                    {m.text ? <MarkdownMessage text={m.text} /> : loading ? <span className="text-sm text-foreground/40">…</span> : null}
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Frame toggle — only for uploaded videos (YouTube is cross-origin) */}
      {canCapture && (
        <label className="flex items-center gap-2 px-3 pt-2 text-xs text-muted-foreground cursor-pointer select-none flex-shrink-0">
          <input
            type="checkbox"
            checked={sendFrame}
            onChange={e => setSendFrame(e.target.checked)}
            className="w-3.5 h-3.5 accent-[#F5C518] rounded border-border"
          />
          Frame sent with each question
        </label>
      )}

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); send(input); setInput('') }}
        className="flex items-center gap-2 px-3 py-2.5 border-t border-border/60 flex-shrink-0 mt-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={`Ask about ${opponentName}…`}
          className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground/40 min-w-0"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="text-xs px-3 py-1.5 bg-foreground text-background rounded-lg disabled:opacity-40 transition-opacity flex-shrink-0"
        >
          {loading ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; ai?: boolean }[] = [
  { id: 'brief', label: 'Brief' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'notes', label: 'Notes' },
  { id: 'stats', label: 'Stats' },
  { id: 'prediction', label: 'Prediction' },
  { id: 'ask', label: 'Ask AI', ai: true },
]

export function ScoutingView({
  match,
  videoUrl,
  insights,
  timelineItems,
  sortedPositions,
  maxPositionTime,
  positionNames,
  backHref,
  backLabel,
  viewMode,
  opponentIntel,
  userIntel,
  narration,
  hasOwnFootage,
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
    kbVersion?: number | null
  }
  videoUrl: string | null
  insights: InsightRow[]
  timelineItems: TimelineItem[]
  sortedPositions: [string, PositionStat][]
  maxPositionTime: number
  positionNames: Record<string, string>
  backHref: string
  backLabel?: string
  viewMode?: 'scouting' | 'analysis'
  opponentIntel?: IntelRecord | null
  userIntel?: IntelRecord | null
  narration?: string | null
  hasOwnFootage?: boolean
}) {
  const [currentTime, setCurrentTime] = useState(0)
  const [activeTab, setActiveTab] = useState<TabId>('brief')
  const [liveNarration, setLiveNarration] = useState<string | null>(narration ?? null)
  const [narratingAuto, setNarratingAuto] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    if (liveNarration) return
    setNarratingAuto(true)
    fetch(`/api/matches/${match.id}/narrate`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { narration?: string } | null) => { if (data?.narration) setLiveNarration(data.narration) })
      .catch(() => {})
      .finally(() => setNarratingAuto(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleRegenerateNarration() {
    if (regenerating) return
    setRegenerating(true)
    setLiveNarration(null)
    fetch(`/api/matches/${match.id}/narrate`, { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { narration?: string } | null) => { if (data?.narration) setLiveNarration(data.narration) })
      .catch(() => {})
      .finally(() => setRegenerating(false))
  }

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

  const handleCorrectPosition = useCallback(async (segmentId: string, newPositionId: string) => {
    await correctPosition(segmentId, newPositionId)
  }, [])

  const opponentName =
    match.opponentLabel && match.opponentLabel.toLowerCase() !== 'unknown'
      ? match.opponentLabel
      : 'Opponent'

  // In scouting mode the scan is run for the scouted opponent (passed in as `athleteName`,
  // stored as `competitorLabel`), and `opponentLabel` is whoever they faced in that footage.
  // So "the person we're scouting" is `competitorLabel`, not `opponentLabel` — using
  // `opponentLabel` here would label the analysis with the wrong fighter's name.
  const scoutedOpponentName = viewMode === 'scouting' ? (match.competitorLabel ?? opponentName) : opponentName

  const label = viewMode === 'analysis' ? 'Match Analysis' : 'Scouting'
  const defaultBackLabel = viewMode === 'analysis' ? '← My Matches' : '← Scout Opponent'
  const visibleTabs = viewMode === 'analysis' ? TABS.filter(tab => tab.id !== 'prediction') : TABS

  return (
    <div className="flex flex-col h-full max-w-[1400px] mx-auto w-full px-4 sm:px-6">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm flex items-start justify-between pb-3 border-b flex-shrink-0 gap-4">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Link href={backHref} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {backLabel ?? defaultBackLabel}
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
            <h1 className="text-lg font-bold">
              {match.competitorLabel ? `${match.competitorLabel} vs. ${opponentName}` : opponentName}
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/25 flex-shrink-0 tracking-wide uppercase">
              {label}
            </span>
            {(match.kbVersion ?? 0) >= 1 && (
              <span
                className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F5C518]/10 text-[#F5C518] border border-[#F5C518]/20 flex-shrink-0"
                title={match.kbVersion && match.kbVersion > 1 ? `Technique library applied · upgraded ${match.kbVersion - 1}×` : 'Technique library applied during analysis'}
              >
                <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 0 1 .894.553l1.618 3.276 3.614.525a1 1 0 0 1 .554 1.706L11.97 9.695l.617 3.6a1 1 0 0 1-1.451 1.054L8 12.617l-3.136 1.732a1 1 0 0 1-1.45-1.054l.616-3.6L1.32 7.06a1 1 0 0 1 .554-1.706l3.614-.525L7.106 1.553A1 1 0 0 1 8 1z"/></svg>
                Technique library
              </span>
            )}
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

        {/* Left — video (inlined to avoid remount on tab switch) */}
        <div className={`flex flex-col flex-shrink-0 gap-3 overflow-hidden transition-all duration-200 ${activeTab === 'ask' ? 'w-[38%]' : 'w-[48%]'}`}>
          <div className="rounded-xl overflow-hidden bg-black border border-border/60 flex-shrink-0">
            {ytId ? (
              <div className="aspect-video">
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1&hd=1`}
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
        </div>

        {/* Right — tabbed panel */}
        <div className="flex-1 flex flex-col overflow-hidden border border-border/60 rounded-xl bg-card">
          {/* Tab bar */}
          <div className="flex border-b border-border/60 flex-shrink-0 overflow-x-auto">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative flex-shrink-0 ${
                  tab.ai
                    ? activeTab === tab.id
                      ? 'text-[#F5C518]'
                      : 'text-[#F5C518]/60 hover:text-[#F5C518]'
                    : activeTab === tab.id
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.ai ? (
                  <span className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    {tab.label}
                  </span>
                ) : tab.id === 'timeline' && timelineItems.length > 0
                  ? `${tab.label} (${timelineItems.length})`
                  : tab.id === 'notes' && insights.length > 0
                  ? `${tab.label} (${insights.length})`
                  : tab.label}
                {activeTab === tab.id && (
                  <span className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full ${tab.ai ? 'bg-[#F5C518]' : 'bg-foreground'}`} />
                )}
              </button>
            ))}
          </div>

          {/* Tab content — AskTab stays mounted to preserve chat state and active fetches */}
          <div className={`flex-1 min-h-0 ${activeTab === 'ask' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
            <div className={activeTab === 'brief' ? '' : 'hidden'}>
              <BriefTab insights={insights} narration={liveNarration} narratingAuto={narratingAuto || regenerating} onRegenerateNarration={handleRegenerateNarration} />
              {viewMode === 'scouting' && <RecordsComparison opponentLabel={scoutedOpponentName} opponentIntel={opponentIntel} userIntel={userIntel} />}
            </div>
            <div className={activeTab === 'timeline' ? '' : 'hidden'}>
              <TimelineTab
                items={timelineItems}
                onSeek={seekTo}
                competitorLabel={match.competitorLabel}
                opponentLabel={match.opponentLabel}
                onCorrectPosition={handleCorrectPosition}
              />
            </div>
            <div className={activeTab === 'notes' ? '' : 'hidden'}><NotesTab insights={insights} /></div>
            <div className={activeTab === 'stats' ? '' : 'hidden'}>
              <StatsTab
                sortedPositions={sortedPositions}
                maxPositionTime={maxPositionTime}
                positionNames={positionNames}
                timelineItems={timelineItems}
                scoutedName={scoutedOpponentName?.split(' ')[0] ?? undefined}
              />
            </div>
            <div className={activeTab === 'prediction' ? '' : 'hidden'}><PredictionTab insights={insights} opponentName={scoutedOpponentName} hasOwnFootage={hasOwnFootage} /></div>
            <div className={`${activeTab === 'ask' ? 'flex flex-col h-full' : 'hidden'}`}>
              <AskTab matchId={match.id} currentTime={currentTime} opponentName={scoutedOpponentName} videoRef={ytId ? undefined : videoRef} contextInsights={insights} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile: brief first, rest tabbed ── */}
      {/* height: dvh minus nav (56px) + main-top-padding (24px) + scouting header (~90px) = 170px */}
      <div className="md:hidden flex flex-col pt-4 gap-3" style={{ height: 'calc(100dvh - 170px)', overflow: 'hidden' }}>
        {/* TL;DR chips — always visible above the fold for match-day use */}
        {insights.length > 0 && (
          <div className="flex-shrink-0 rounded-xl border border-border/60 bg-card">
            <TldrChips insights={insights} />
          </div>
        )}

        {/* Brief — capped so tab panel always gets ≥50% of remaining space */}
        <div className="flex-shrink-0 rounded-xl border border-border/60 bg-card max-h-[38vh] overflow-y-auto">
          <BriefTab insights={insights} narration={liveNarration} narratingAuto={narratingAuto || regenerating} onRegenerateNarration={handleRegenerateNarration} large />
          {viewMode === 'scouting' && <RecordsComparison opponentLabel={scoutedOpponentName} opponentIntel={opponentIntel} userIntel={userIntel} />}
        </div>

        {/* Tabs for the rest */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden border border-border/60 rounded-xl bg-card">
          <div className="flex border-b border-border/60 flex-shrink-0 overflow-x-auto">
            {visibleTabs.filter(t => t.id !== 'brief').map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id === activeTab ? 'timeline' : tab.id)}
                className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors relative flex-shrink-0 ${
                  tab.ai
                    ? activeTab === tab.id ? 'text-[#F5C518]' : 'text-[#F5C518]/60 hover:text-[#F5C518]'
                    : activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {tab.ai ? (
                  <span className="flex items-center gap-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                    </svg>
                    {tab.label}
                  </span>
                ) : tab.label}
                {activeTab === tab.id && (
                  <span className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full ${tab.ai ? 'bg-[#F5C518]' : 'bg-foreground'}`} />
                )}
              </button>
            ))}
          </div>
          <div className={`flex-1 min-h-0 ${activeTab === 'ask' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
            <div className={activeTab === 'timeline' ? '' : 'hidden'}>
              <TimelineTab items={timelineItems} onSeek={seekTo} competitorLabel={match.competitorLabel} opponentLabel={match.opponentLabel} />
            </div>
            <div className={activeTab === 'notes' ? '' : 'hidden'}><NotesTab insights={insights} /></div>
            <div className={activeTab === 'stats' ? '' : 'hidden'}><StatsTab sortedPositions={sortedPositions} maxPositionTime={maxPositionTime} positionNames={positionNames} timelineItems={timelineItems} scoutedName={scoutedOpponentName?.split(' ')[0] ?? undefined} /></div>
            <div className={activeTab === 'prediction' ? '' : 'hidden'}><PredictionTab insights={insights} opponentName={scoutedOpponentName} hasOwnFootage={hasOwnFootage} /></div>
            <div className={`${activeTab === 'ask' ? 'flex flex-col h-full' : 'hidden'}`}>
              <AskTab matchId={match.id} currentTime={currentTime} opponentName={scoutedOpponentName} videoRef={ytId ? undefined : videoRef} contextInsights={insights} />
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
