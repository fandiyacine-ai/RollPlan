'use client'

import { useState, useEffect } from 'react'

export function VideoThumbnail({ src, className }: { src: string; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false

    const vid = document.createElement('video')
    vid.crossOrigin = 'anonymous'
    vid.muted = true
    vid.preload = 'metadata'

    vid.onloadedmetadata = () => {
      vid.currentTime = Math.min(2, vid.duration * 0.05)
    }

    vid.onseeked = () => {
      if (cancelled) return
      const c = document.createElement('canvas')
      c.width = 160
      c.height = 90
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.drawImage(vid, 0, 0, 160, 90)
      try {
        setDataUrl(c.toDataURL('image/jpeg', 0.75))
      } catch {
        // CORS-tainted canvas — silently ignore, placeholder stays
      }
    }

    vid.onerror = () => {}
    vid.src = src

    return () => {
      cancelled = true
      vid.src = ''
    }
  }, [src])

  if (!dataUrl) {
    return (
      <div className={`bg-muted/50 flex items-center justify-center flex-shrink-0 ${className}`}>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted-foreground/40"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m10 9 5 3-5 3V9z" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={dataUrl}
      alt=""
      className={`object-cover flex-shrink-0 ${className}`}
    />
  )
}
