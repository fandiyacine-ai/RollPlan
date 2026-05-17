'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

type SegmentRef = { id: string; startSeconds: number; endSeconds: number }

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
  roi: { x1: number; y1: number; x2: number; y2: number }
  athlete: { x: number; y: number }
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const CATEGORY_COLORS: Record<string, string> = {
  strength: 'bg-green-50 border-green-200 text-green-800',
  mistake: 'bg-red-50 border-red-200 text-red-800',
  opportunity: 'bg-blue-50 border-blue-200 text-blue-800',
  pattern: 'bg-yellow-50 border-yellow-200 text-yellow-800',
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  moderate: 'bg-yellow-500',
  minor: 'bg-gray-400',
}

function drawOverlay(canvas: HTMLCanvasElement, spatial: SpatialData) {
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

  // "YOUR MAT" label top-left of box
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

  // Athlete position marker
  const ax = athlete.x * W
  const ay = athlete.y * H
  ctx.beginPath()
  ctx.arc(ax, ay, 20, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(239,68,68,0.4)'
  ctx.lineWidth = 7
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(ax, ay, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#ef4444'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(ax, ay, 10, 0, Math.PI * 2)
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 2
  ctx.stroke()

  // "YOU" badge
  ctx.font = 'bold 11px sans-serif'
  const yw = ctx.measureText('YOU').width
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.roundRect(ax + 16, ay - 9, yw + 10, 18, 3)
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('YOU', ax + 21, ay)
}

export function MatchContent({
  videoUrl,
  matchInsights,
  segmentsById,
  spatialData,
}: {
  videoUrl: string | null
  matchInsights: InsightRow[]
  segmentsById: Record<string, SegmentRef>
  spatialData: SpatialData | null
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })

  // Keep canvas size in sync with rendered video dimensions
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

  // Update canvas pixel dimensions when container resizes
  useEffect(() => {
    const c = canvasRef.current
    if (!c || canvasDims.w === 0) return
    c.width = canvasDims.w
    c.height = canvasDims.h
  }, [canvasDims])

  // Draw / clear overlay
  const redraw = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    if (overlayVisible && spatialData && canvasDims.w > 0) {
      drawOverlay(c, spatialData)
    } else {
      c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    }
  }, [overlayVisible, spatialData, canvasDims])

  useEffect(() => { redraw() }, [redraw])

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
      {/* Video player with spatial overlay */}
      {videoUrl && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Match Video</h2>
          <div className="relative rounded-lg overflow-hidden border bg-black select-none">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-[45vh] object-contain block"
              preload="metadata"
            />
            {/* Overlay canvas — sits on top of the video, pointer-events:none so controls still work */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 pointer-events-none"
              style={{
                opacity: overlayVisible ? 1 : 0,
                transition: 'opacity 0.4s',
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {spatialData
              ? 'Click a timestamp below — the video will jump there and show your mat region and position.'
              : 'Click a timestamp below to jump to that moment in the video.'}
          </p>
        </div>
      )}

      {/* AI Insights */}
      {matchInsights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">AI Insights</h2>
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

                  {/* Clickable timestamp chips */}
                  {evidenceSegs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {evidenceSegs.map((seg) => (
                        <button
                          key={seg.id}
                          onClick={() => seekTo(seg.startSeconds)}
                          title="Jump to this moment and highlight your mat area"
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-black/10 hover:bg-black/20 active:bg-black/30 transition-colors font-mono cursor-pointer"
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
        <p className="text-sm text-muted-foreground">No insights generated for this match.</p>
      )}
    </div>
  )
}
