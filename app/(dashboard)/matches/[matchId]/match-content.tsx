'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import { correctPosition } from './actions'
import { POSITIONS } from '../../../../lib/taxonomy/positions'

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] ?? null
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch')) return u.searchParams.get('v')
      const m = u.pathname.match(/\/(?:live|embed|v)\/([^/?]+)/)
      return m?.[1] ?? null
    }
  } catch {}
  return null
}

type Bbox = { x1: number; y1: number; x2: number; y2: number }

type SegmentRef = {
  id: string
  startSeconds: number
  endSeconds: number
  userBbox: Bbox | null
  opponentBbox: Bbox | null
}

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

export type TimelineItem =
  | {
      type: 'position'
      time: number
      positionName: string
      dominance: string
      durationSeconds: number
      segmentId: string
    }
  | {
      type: 'event'
      time: number
      actor: string
      eventName: string
      techniqueLabel: string | null
      outcome: string | null
    }

type SpatialData = {
  roi: Bbox
  athlete: Bbox
}

function formatTime(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return s > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}

const CATEGORY_ACCENT: Record<string, { color: string; pill: string }> = {
  strength:    { color: '#10b981', pill: 'bg-emerald-500/15 text-emerald-400' },
  mistake:     { color: '#f43f5e', pill: 'bg-rose-500/15 text-rose-400' },
  opportunity: { color: '#3b82f6', pill: 'bg-blue-500/15 text-blue-400' },
  pattern:     { color: '#f59e0b', pill: 'bg-amber-500/15 text-amber-400' },
}

const SEVERITY_PILL: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-400',
  moderate: 'bg-amber-500/15 text-amber-400',
  minor:    'bg-zinc-500/15 text-zinc-400',
}

function CategoryIcon({ category }: { category: string }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0'
  const svgProps = { className: cls, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.75', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (category === 'strength') return (
    <svg {...svgProps}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
      <polyline points="16 7 22 7 22 13"/>
    </svg>
  )
  if (category === 'mistake') return (
    <svg {...svgProps}>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
  if (category === 'opportunity') return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  )
  if (category === 'pattern') return (
    <svg {...svgProps}>
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 014-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 01-4 4H3"/>
    </svg>
  )
  return null
}

const DOMINANCE_DOT: Record<string, string> = {
  dominant: 'bg-emerald-500',
  inferior: 'bg-rose-500',
  neutral: 'bg-zinc-500',
}

const DOMINANCE_LABEL: Record<string, string> = {
  dominant: 'In control',
  inferior: 'Under pressure',
  neutral: 'Neutral',
}

function TimelineRow({
  item,
  onSeek,
  onCorrectPosition,
  competitorLabel,
  opponentLabel,
}: {
  item: TimelineItem
  onSeek?: () => void
  onCorrectPosition?: (segmentId: string, newPositionId: string) => void
  competitorLabel?: string | null
  opponentLabel?: string | null
}) {
  const [correcting, setCorrecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const isPosition = item.type === 'position'

  async function handleCorrect(newId: string) {
    if (!isPosition || !onCorrectPosition) return
    setSaving(true)
    await onCorrectPosition(item.segmentId, newId)
    setSaving(false)
    setCorrecting(false)
  }

  return (
    <div
      className={`relative flex items-start gap-4 pl-10 py-2.5 group ${onSeek && !correcting ? 'cursor-pointer hover:bg-muted/40 rounded-lg' : ''}`}
      onClick={correcting ? undefined : onSeek}
    >
      {/* Node */}
      <div className="absolute left-3.5 top-4 -translate-y-1/2 z-10">
        {isPosition ? (
          <div className={`w-2.5 h-2.5 rounded-full border-2 border-background ${DOMINANCE_DOT[item.dominance] ?? 'bg-zinc-500'}`} />
        ) : (
          <div className={`w-2.5 h-2.5 rounded-full ${item.actor === 'user' ? 'bg-blue-400' : 'bg-orange-400'}`} />
        )}
      </div>

      {/* Timestamp */}
      <span className="text-xs font-mono text-muted-foreground w-10 flex-shrink-0 pt-0.5 tabular-nums">
        {formatTime(item.time)}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isPosition ? (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-medium">{item.positionName}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                item.dominance === 'dominant' ? 'text-emerald-500' :
                item.dominance === 'inferior' ? 'text-rose-500' : 'text-muted-foreground'
              }`}>{DOMINANCE_LABEL[item.dominance]}</span>
              <span className="text-xs text-muted-foreground ml-auto tabular-nums">{formatTime(item.durationSeconds)}</span>
              {onCorrectPosition && !correcting && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setCorrecting(true) }}
                  className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground opacity-25 group-hover:opacity-100 transition-all flex-shrink-0"
                  title="Correct this position"
                >
                  Wrong?
                </button>
              )}
            </div>
            {correcting && (
              <div className="mt-1.5 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <select
                  className="text-xs rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  defaultValue={POSITIONS.find(p => p.name === item.positionName)?.id ?? ''}
                  onChange={e => handleCorrect(e.target.value)}
                  disabled={saving}
                >
                  <option value="" disabled>Pick correct position…</option>
                  {POSITIONS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCorrecting(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              item.actor === 'user' ? 'bg-blue-950 text-blue-400' : 'bg-orange-950 text-orange-400'
            }`}>
              {item.actor === 'user' ? (competitorLabel ?? 'You') : (opponentLabel ?? 'Opp')}
            </span>
            <span className="text-sm font-medium">{item.eventName}</span>
            {item.techniqueLabel && (
              <span className="text-xs text-muted-foreground italic">{item.techniqueLabel}</span>
            )}
            {item.outcome && (
              <span className="text-xs text-muted-foreground ml-auto capitalize">{item.outcome}</span>
            )}
          </div>
        )}
      </div>

      {/* Seek arrow, shown on hover */}
      {onSeek && !correcting && (
        <span className="text-muted-foreground/30 group-hover:text-muted-foreground text-xs flex-shrink-0 transition-colors self-center">▶</span>
      )}
    </div>
  )
}

function drawSpatialOverlay(canvas: HTMLCanvasElement, spatial: SpatialData) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const { roi, athlete } = spatial
  const rx = roi.x1 * W
  const ry = roi.y1 * H
  const rw = (roi.x2 - roi.x1) * W
  const rh = (roi.y2 - roi.y1) * H

  // Dim outside ROI
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, W, ry)
  ctx.fillRect(0, ry + rh, W, H - ry - rh)
  ctx.fillRect(0, ry, rx, rh)
  ctx.fillRect(rx + rw, ry, W - rx - rw, rh)

  // Green ROI box
  ctx.strokeStyle = '#4ade80'
  ctx.lineWidth = 3
  ctx.setLineDash([8, 4])
  ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3)
  ctx.setLineDash([])

  // "YOUR MAT" label
  ctx.font = 'bold 11px sans-serif'
  const label = 'YOUR MAT'
  const lw = ctx.measureText(label).width
  ctx.fillStyle = '#4ade80'
  ctx.beginPath()
  ctx.roundRect(rx, ry - 20, lw + 12, 20, [3, 3, 0, 0])
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, rx + 6, ry - 10)

  // Red athlete box
  const abx = athlete.x1 * W, aby = athlete.y1 * H
  const abw = (athlete.x2 - athlete.x1) * W, abh = (athlete.y2 - athlete.y1) * H
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2.5
  ctx.setLineDash([6, 3])
  ctx.strokeRect(abx, aby, abw, abh)
  ctx.setLineDash([])

  // "YOU" label above athlete box
  ctx.font = 'bold 11px sans-serif'
  const yw = ctx.measureText('YOU').width
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.roundRect(abx, aby - 20, yw + 10, 20, [3, 3, 0, 0])
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('YOU', abx + 5, aby - 10)
}

function drawBboxes(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  userBbox: Bbox | null,
  opponentBbox: Bbox | null,
) {
  ctx.font = 'bold 11px sans-serif'

  if (userBbox) {
    const x = userBbox.x1 * W, y = userBbox.y1 * H
    const w = (userBbox.x2 - userBbox.x1) * W, h = (userBbox.y2 - userBbox.y1) * H
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 2.5
    ctx.setLineDash([6, 3])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
    const lw = ctx.measureText('YOU').width
    const labelY = Math.max(0, y - 20)
    ctx.fillStyle = '#4ade80'
    ctx.beginPath()
    ctx.roundRect(x, labelY, lw + 10, 20, [3, 3, 0, 0])
    ctx.fill()
    ctx.fillStyle = '#000'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('YOU', x + 5, labelY + 10)
  }

  if (opponentBbox) {
    const x = opponentBbox.x1 * W, y = opponentBbox.y1 * H
    const w = (opponentBbox.x2 - opponentBbox.x1) * W, h = (opponentBbox.y2 - opponentBbox.y1) * H
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2.5
    ctx.setLineDash([6, 3])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
    const lw = ctx.measureText('OPP').width
    const labelY = Math.max(0, y - 20)
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.roundRect(x, labelY, lw + 10, 20, [3, 3, 0, 0])
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('OPP', x + 5, labelY + 10)
  }
}

export function MatchContent({
  videoUrl,
  videoHidden,
  matchInsights: initialInsights,
  segments,
  spatialData,
  timelineItems,
  competitorLabel,
  opponentLabel,
  matchId,
}: {
  videoUrl: string | null
  videoHidden?: boolean
  matchInsights: InsightRow[]
  segments: SegmentRef[]
  spatialData: SpatialData | null
  timelineItems: TimelineItem[]
  competitorLabel?: string | null
  opponentLabel?: string | null
  matchId?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })
  const [activeTab, setActiveTab] = useState<'timeline' | 'notes'>('timeline')
  const [matchInsights, setMatchInsights] = useState<InsightRow[]>(initialInsights)
  const [regenerating, setRegenerating] = useState(false)

  async function regenerateInsights() {
    if (!matchId || regenerating) return
    setRegenerating(true)
    try {
      const res = await fetch(`/api/matches/${matchId}/regenerate-insights`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      // Reload the page to fetch fresh insights from server
      window.location.reload()
    } catch {
      setRegenerating(false)
    }
  }

  // Refs read by event handlers (avoid stale closures)
  const segmentsRef = useRef(segments)
  useEffect(() => { segmentsRef.current = segments }, [segments])

  const currentBboxRef = useRef<{ user: Bbox | null; opp: Bbox | null } | null>(null)
  const redrawRef = useRef<() => void>(() => {})

  // Keep canvas pixel dimensions in sync with rendered video size
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    const obs = new ResizeObserver(() => {
      const r = vid.getBoundingClientRect()
      if (r.width > 0) setCanvasDims({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    obs.observe(vid)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c || canvasDims.w === 0) return
    c.width = canvasDims.w
    c.height = canvasDims.h
  }, [canvasDims])

  // Re-build the redraw closure whenever state/props change, then call it immediately
  useEffect(() => {
    redrawRef.current = () => {
      const c = canvasRef.current
      if (!c || canvasDims.w === 0) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, c.width, c.height)

      if (overlayVisible && spatialData) {
        drawSpatialOverlay(c, spatialData)
        c.style.transition = 'none'
        c.style.opacity = '1'
      } else {
        const bbox = currentBboxRef.current
        if (bbox && (bbox.user || bbox.opp)) {
          drawBboxes(ctx, c.width, c.height, bbox.user, bbox.opp)
          c.style.transition = 'none'
          c.style.opacity = '1'
        } else {
          c.style.transition = 'opacity 0.4s'
          c.style.opacity = '0'
        }
      }
    }
    redrawRef.current()
  }, [overlayVisible, spatialData, canvasDims])

  // Drive bbox overlay from video playback time
  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return
    function onTime() {
      const t = vid!.currentTime
      const seg = segmentsRef.current.find(s => t >= s.startSeconds && t <= s.endSeconds) ?? null
      currentBboxRef.current = seg ? { user: seg.userBbox, opp: seg.opponentBbox } : null
      redrawRef.current()
    }
    vid.addEventListener('timeupdate', onTime)
    vid.addEventListener('seeked', onTime)
    vid.addEventListener('pause', onTime)
    vid.addEventListener('play', onTime)
    return () => {
      vid.removeEventListener('timeupdate', onTime)
      vid.removeEventListener('seeked', onTime)
      vid.removeEventListener('pause', onTime)
      vid.removeEventListener('play', onTime)
    }
  }, [])

  const segmentsById = useMemo(
    () => Object.fromEntries(segments.map(s => [s.id, s])),
    [segments],
  )

  const hasBboxData = useMemo(
    () => segments.some(s => s.userBbox || s.opponentBbox),
    [segments],
  )

  function seekTo(seconds: number) {
    const ytId = videoUrl ? extractYouTubeId(videoUrl) : null
    if (ytId) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [Math.max(0, seconds - 1.5), true] }), '*'
      )
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
      )
      return
    }

    const vid = videoRef.current
    if (!vid) return
    vid.currentTime = Math.max(0, seconds - 1.5)
    vid.play().catch(() => {})
    vid.scrollIntoView({ behavior: 'smooth', block: 'center' })

    if (spatialData) {
      setOverlayVisible(true)
      clearTimeout(overlayTimer.current)
      overlayTimer.current = setTimeout(() => setOverlayVisible(false), 4500)
    }
  }

  return (
    <div className="space-y-5">
      {/* Video hidden placeholder */}
      {videoHidden && (
        <div className="relative rounded-xl overflow-hidden border bg-muted aspect-video flex items-center justify-center select-none">
          <div className="absolute inset-0 backdrop-blur-sm bg-background/60" />
          <div className="relative text-center space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Video hidden by owner</p>
          </div>
        </div>
      )}

      {/* Video player with overlay canvas */}
      {!videoHidden && (extractYouTubeId(videoUrl ?? '') || videoUrl) && (
        <div className="space-y-2">
          {extractYouTubeId(videoUrl ?? '') ? (
            <div className="relative rounded-xl overflow-hidden border bg-black select-none aspect-video">
              <iframe
                ref={iframeRef}
                src={`https://www.youtube.com/embed/${extractYouTubeId(videoUrl ?? '')}?enablejsapi=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border bg-black select-none">
              <video
                ref={videoRef}
                src={videoUrl!}
                controls
                playsInline
                className="w-full max-h-[45vh] object-contain block"
                preload="metadata"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 pointer-events-none"
                style={{ opacity: 0 }}
              />
            </div>
          )}
          {!extractYouTubeId(videoUrl ?? '') && hasBboxData && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-400 inline-block" />You</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />Opponent</span>
            </div>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border/60 pb-0">
        {([
          { id: 'timeline', label: `Timeline${timelineItems.length > 0 ? ` (${timelineItems.length})` : ''}` },
          { id: 'notes', label: `Coaching Notes${matchInsights.length > 0 ? ` (${matchInsights.length})` : ''}` },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Timeline tab */}
      {activeTab === 'timeline' && (
        <div>
          {timelineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No timeline data for this match.</p>
          ) : (
            <div className="relative">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pb-3">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />{competitorLabel ? `${competitorLabel} in control` : 'In Control'}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-zinc-500 flex-shrink-0" />Neutral</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />{competitorLabel ? `${competitorLabel} under pressure` : 'Under Pressure'}</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />{competitorLabel ?? 'Your'} action</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 flex-shrink-0" />{opponentLabel ?? 'Opponent'} action</span>
              </div>
              <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border/60" />
              <div className="space-y-0">
                {timelineItems.map((item, i) => (
                  <TimelineRow
                    key={i}
                    item={item}
                    onSeek={videoUrl ? () => seekTo(item.time) : undefined}
                    onCorrectPosition={item.type === 'position' ? correctPosition : undefined}
                    competitorLabel={competitorLabel}
                    opponentLabel={opponentLabel}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coaching Notes tab */}
      {activeTab === 'notes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50 font-medium flex items-center gap-1.5">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              AI-generated · <a href="/player-card" className="underline hover:text-muted-foreground">delete data</a>
            </span>
            {matchId && (
              <button
                onClick={regenerateInsights}
                disabled={regenerating}
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground underline disabled:opacity-40 disabled:cursor-wait"
              >
                {regenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            )}
          </div>

          {matchInsights.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No coaching notes generated for this match yet.</p>
          ) : (
            <div className="space-y-3">
              {matchInsights.map((insight) => {
                const ids = Array.isArray(insight.evidenceSegmentIds) ? (insight.evidenceSegmentIds as string[]) : []
                const evidenceSegs = ids.map((id) => segmentsById[id]).filter(Boolean) as SegmentRef[]
                const accent = CATEGORY_ACCENT[insight.category]
                const accentColor = accent?.color ?? '#71717a'
                return (
                  <div
                    key={insight.id}
                    className="rounded-xl border border-border/60 bg-card overflow-hidden"
                    style={{ borderLeft: `3px solid ${accentColor}` }}
                  >
                    {/* Card header */}
                    <div className="flex items-center gap-2 px-4 pt-3 pb-2.5 border-b border-border/40">
                      <span style={{ color: accentColor }}>
                        <CategoryIcon category={insight.category} />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/70 capitalize">
                        {insight.category}
                      </span>
                      <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${SEVERITY_PILL[insight.severity] ?? 'bg-zinc-500/15 text-zinc-400'}`}>
                        {insight.severity}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                        {Math.round(insight.confidence * 100)}%
                      </span>
                    </div>

                    {/* Description */}
                    <p className="px-4 pt-3 text-sm font-semibold leading-snug">
                      {insight.description}
                    </p>

                    {/* Suggestion */}
                    <div className="mx-4 mt-2.5 rounded-lg bg-muted/40 px-3 py-2.5 flex gap-2.5 items-start">
                      <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 006 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
                        <path d="M9 18h6M10 22h4"/>
                      </svg>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">
                        {insight.suggestion}
                      </p>
                    </div>

                    {/* Footer: evidence + YouTube */}
                    {(evidenceSegs.length > 0 || insight.youtubeSearchQuery) && (
                      <div className="px-4 pb-3.5 pt-2.5 flex flex-wrap items-center gap-2">
                        {evidenceSegs.map((seg) => (
                          <button
                            key={seg.id}
                            onClick={() => seekTo(seg.startSeconds)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md bg-muted hover:bg-muted/70 transition-colors text-foreground/70"
                          >
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            {formatTime(seg.startSeconds)}
                          </button>
                        ))}
                        {insight.youtubeSearchQuery && (
                          <a
                            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(insight.youtubeSearchQuery)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md border border-border/60 hover:bg-muted transition-colors text-muted-foreground ml-auto"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                            Drill on YouTube
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
