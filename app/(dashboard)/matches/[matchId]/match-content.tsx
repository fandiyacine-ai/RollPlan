'use client'

import { useRef } from 'react'

type SegmentRef = { id: string; startSeconds: number; endSeconds: number }

type InsightRow = {
  id: string
  category: string
  severity: string
  description: string
  suggestion: string
  confidence: number
  youtubeSearchQuery: string | null
  evidenceSegmentIds: unknown // jsonb — cast to string[]
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

export function MatchContent({
  videoUrl,
  matchInsights,
  segmentsById,
}: {
  videoUrl: string | null
  matchInsights: InsightRow[]
  segmentsById: Record<string, SegmentRef>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  function seekTo(seconds: number) {
    const vid = videoRef.current
    if (!vid) return
    vid.currentTime = Math.max(0, seconds - 1.5)
    vid.play().catch(() => {})
    vid.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="space-y-6">
      {/* Video player */}
      {videoUrl && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Match Video</h2>
          <div className="rounded-lg overflow-hidden border bg-black">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-[45vh] object-contain block"
              preload="metadata"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Click a timestamp on any insight below to jump to that moment in the video.
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

                  {/* Evidence timestamps — click to seek */}
                  {evidenceSegs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {evidenceSegs.map((seg) => (
                        <button
                          key={seg.id}
                          onClick={() => seekTo(seg.startSeconds)}
                          title={`Jump to ${formatTime(seg.startSeconds)} in video`}
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
