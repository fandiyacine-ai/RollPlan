'use client'

import { useRef, useState, useEffect, useMemo } from 'react'

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

type SpatialData = {
  roi: Bbox
  athlete: Bbox
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const CATEGORY_COLORS: Record<string, string> = {
  strength: 'bg-emerald-950/60 border-emerald-800/50 text-emerald-300',
  mistake: 'bg-rose-950/60 border-rose-800/50 text-rose-300',
  opportunity: 'bg-blue-950/60 border-blue-800/50 text-blue-300',
  pattern: 'bg-amber-950/60 border-amber-800/50 text-amber-300',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  moderate: 'bg-amber-500',
  minor: 'bg-zinc-500',
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
  matchInsights,
  segments,
  spatialData,
}: {
  videoUrl: string | null
  matchInsights: InsightRow[]
  segments: SegmentRef[]
  spatialData: SpatialData | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })

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
    <div className="space-y-6">
      {/* Video player with overlay canvas */}
      {videoUrl && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Footage</h2>
          <div className="relative rounded-lg overflow-hidden border bg-black select-none">
            <video
              ref={videoRef}
              src={videoUrl}
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
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              {spatialData
                ? 'Click a timestamp below — the video will jump there and highlight your mat region.'
                : 'Click a timestamp below to jump to that moment in the video.'}
            </p>
            {hasBboxData && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />
                  You
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />
                  Opponent
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Coaching Notes */}
      {matchInsights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Coaching Notes</h2>
            <span className="text-[10px] text-muted-foreground/60 font-medium">Generated by AI · <a href="/player-card" className="underline hover:text-muted-foreground">delete data</a></span>
          </div>
          <div className="space-y-2">
            {matchInsights.map((insight) => {
              const ids = Array.isArray(insight.evidenceSegmentIds) ? (insight.evidenceSegmentIds as string[]) : []
              const evidenceSegs = ids.map((id) => segmentsById[id]).filter(Boolean) as SegmentRef[]

              return (
                <div
                  key={insight.id}
                  className={`rounded-lg border p-4 space-y-1.5 ${CATEGORY_COLORS[insight.category] ?? 'bg-muted border-muted'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT[insight.severity] ?? 'bg-gray-400'}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide capitalize">{insight.category}</span>
                    <span className="text-xs opacity-60 ml-auto">{Math.round(insight.confidence * 100)}% conf.</span>
                  </div>
                  <p className="text-sm font-medium">{insight.description}</p>
                  <p className="text-sm opacity-80">{insight.suggestion}</p>

                  {evidenceSegs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {evidenceSegs.map((seg) => (
                        <button
                          key={seg.id}
                          onClick={() => seekTo(seg.startSeconds)}
                          title="Jump to this moment"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors font-mono cursor-pointer"
                        >
                          ▶ {formatTime(seg.startSeconds)}–{formatTime(seg.endSeconds)}
                        </button>
                      ))}
                    </div>
                  )}

                  {insight.youtubeSearchQuery && (
                    <a
                      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(insight.youtubeSearchQuery)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium mt-0.5 opacity-70 hover:opacity-100 transition-opacity"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                      Watch technique
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {matchInsights.length === 0 && (
        <p className="text-sm text-muted-foreground">No coaching notes generated for this match yet.</p>
      )}
    </div>
  )
}
