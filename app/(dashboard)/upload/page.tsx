'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Tab = 'file' | 'url'
type ScanMode = 'single' | 'scan'
type SourceType = 'own_competition' | 'own_sparring' | 'opponent'
type Format = 'gi' | 'no_gi'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'
type AppearanceColor = 'blue_gi' | 'white_gi' | 'black_gi' | 'dark_rash' | 'light_rash' | 'other'
type StartingSide = 'left' | 'right'
type Rect = { x1: number; y1: number; x2: number; y2: number }
type Pt = { x: number; y: number }
type Frame = { dataUrl: string; naturalW: number; naturalH: number; label?: 'entry' }
type SpatialData = { roi: Rect; athlete: Rect }
type FrameResult = { spatialHint: string; athleteImageBase64: string; spatialData: SpatialData }

const SOURCE_LABELS: Record<SourceType, string> = {
  own_competition: 'My competition match',
  own_sparring: 'My sparring session',
  opponent: 'Opponent footage',
}

const COLOR_OPTIONS: { value: AppearanceColor; label: string; bg: string }[] = [
  { value: 'blue_gi',    label: 'Blue Gi',    bg: 'bg-blue-600' },
  { value: 'white_gi',   label: 'White Gi',   bg: 'bg-white border border-gray-300' },
  { value: 'black_gi',   label: 'Black Gi',   bg: 'bg-neutral-900' },
  { value: 'dark_rash',  label: 'Dark Rash',  bg: 'bg-gray-800' },
  { value: 'light_rash', label: 'Light Rash', bg: 'bg-gray-200 border border-gray-300' },
  { value: 'other',      label: 'Other',      bg: 'bg-gradient-to-br from-purple-400 to-pink-400' },
]

const COLOR_HINT: Record<AppearanceColor, string> = {
  blue_gi: 'blue gi', white_gi: 'white gi', black_gi: 'black gi',
  dark_rash: 'dark rashguard', light_rash: 'light rashguard', other: 'other-coloured kit',
}

function buildAppearanceHint(color: AppearanceColor | null, side: StartingSide | null): string {
  const parts: string[] = []
  if (color) parts.push(COLOR_HINT[color])
  if (side) parts.push(`starts on the ${side} side of the mat`)
  return parts.join(', ')
}

function buildSpatialHint(roi: Rect, athlete: Rect): string {
  const l = Math.round(roi.x1 * 100), r = Math.round(roi.x2 * 100)
  const t = Math.round(roi.y1 * 100), b = Math.round(roi.y2 * 100)
  const al = Math.round(athlete.x1 * 100), ar = Math.round(athlete.x2 * 100)
  const at_ = Math.round(athlete.y1 * 100), ab = Math.round(athlete.y2 * 100)
  const cx = (athlete.x1 + athlete.x2) / 2
  const hPos = cx < (roi.x1 + roi.x2) / 2 ? 'left' : 'right'
  return `Focus ONLY on the match within the region spanning ${l}%–${r}% of frame width and ${t}%–${b}% of frame height — ignore all athletes and matches outside this area. Within that mat, the competitor to track is the athlete on the ${hPos} side, inside the bounding box spanning ${al}%–${ar}% horizontally and ${at_}%–${ab}% vertically.`
}

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

function randomFractions(count = 4): number[] {
  return Array.from({ length: count }, () => 0.05 + Math.random() * 0.88)
    .sort((a, b) => a - b)
}

function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const vid = document.createElement('video')
    vid.muted = true
    vid.preload = 'metadata'
    vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Math.round(vid.duration)) }
    vid.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    vid.src = url
  })
}

// Always include early absolute-second frames (athletes entering mat) + fraction-based match frames.
// Entry frames are sorted first; duplicates within 3s are dropped.
async function extractFramesAt(
  file: File,
  fractions: number[],
  earlySeconds: number[] = [3, 8, 16],
): Promise<Frame[]> {
  const url = URL.createObjectURL(file)
  try {
    const vid = document.createElement('video')
    vid.muted = true
    vid.preload = 'metadata'
    vid.src = url
    await new Promise<void>((res, rej) => {
      vid.onloadedmetadata = () => res()
      vid.onerror = () => rej(new Error('load failed'))
      setTimeout(() => rej(new Error('timeout')), 10000)
    })
    const duration = vid.duration

    const slots: Array<{ secs: number; label?: 'entry' }> = []
    for (const s of earlySeconds) {
      if (s < duration - 0.5) slots.push({ secs: s, label: 'entry' })
    }
    for (const f of fractions) {
      const secs = Math.max(0.5, duration * f)
      if (!slots.some(t => Math.abs(t.secs - secs) < 3)) slots.push({ secs })
    }
    slots.sort((a, b) => a.secs - b.secs)

    const frames: Frame[] = []
    for (const { secs, label } of slots) {
      vid.currentTime = secs
      await new Promise<void>((res) => { vid.onseeked = () => res() })
      const c = document.createElement('canvas')
      c.width = vid.videoWidth; c.height = vid.videoHeight
      c.getContext('2d')!.drawImage(vid, 0, 0)
      frames.push({ dataUrl: c.toDataURL('image/jpeg', 0.75), naturalW: vid.videoWidth, naturalH: vid.videoHeight, label })
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Build an annotated reference image: the full frame with green mat box and red "YOU" label drawn on it.
// This gives the AI full spatial context — both athletes visible, mat area highlighted, and the user
// unambiguously labelled — which is far more reliable for identity tracking than a small crop.
function buildAnnotatedRefImageBase64(frame: Frame, roi: Rect, athleteBox: Rect): Promise<string> {
  return new Promise((resolve, reject) => {
    const maxW = 900
    const scale = Math.min(1, maxW / frame.naturalW)
    const dw = Math.round(frame.naturalW * scale)
    const dh = Math.round(frame.naturalH * scale)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = dw; c.height = dh
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, dw, dh)
      const W = dw, H = dh

      const rx = Math.min(roi.x1, roi.x2) * W
      const ry = Math.min(roi.y1, roi.y2) * H
      const rw = Math.abs(roi.x2 - roi.x1) * W
      const rh = Math.abs(roi.y2 - roi.y1) * H

      // Dim outside ROI
      ctx.fillStyle = 'rgba(0,0,0,0.38)'
      ctx.fillRect(0, 0, W, ry)
      ctx.fillRect(0, ry + rh, W, H - ry - rh)
      ctx.fillRect(0, ry, rx, rh)
      ctx.fillRect(rx + rw, ry, W - rx - rw, rh)

      // Green mat box
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 3
      ctx.setLineDash([8, 4])
      ctx.strokeRect(rx + 1.5, ry + 1.5, rw - 3, rh - 3)
      ctx.setLineDash([])
      ctx.font = 'bold 12px sans-serif'
      const mlw = ctx.measureText('YOUR MAT').width
      ctx.fillStyle = '#4ade80'
      ctx.beginPath()
      ctx.roundRect(rx, Math.max(0, ry - 22), mlw + 12, 22, [3])
      ctx.fill()
      ctx.fillStyle = '#000'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('YOUR MAT', rx + 6, Math.max(11, ry - 11))

      // Red athlete box — thick stroke for prominence
      const ax = Math.min(athleteBox.x1, athleteBox.x2) * W
      const ay = Math.min(athleteBox.y1, athleteBox.y2) * H
      const aw = Math.abs(athleteBox.x2 - athleteBox.x1) * W
      const ah = Math.abs(athleteBox.y2 - athleteBox.y1) * H
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 4
      ctx.strokeRect(ax, ay, aw, ah)

      // Large "YOU" label
      ctx.font = 'bold 15px sans-serif'
      const youText = '⬅ YOU — track this person'
      const ylw = ctx.measureText(youText).width
      const labelY = Math.max(0, ay - 26)
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.roundRect(ax, labelY, ylw + 12, 26, [3])
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText(youText, ax + 6, labelY + 13)

      resolve(c.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, ''))
    }
    img.onerror = reject
    img.src = frame.dataUrl
  })
}

// ─── Frame selector ───────────────────────────────────────────────────────────

type SelectorPhase = 'loading' | 'pick-frame' | 'draw-roi' | 'mark-athlete' | 'done'

function FrameSelector({
  videoFile,
  onComplete,
}: {
  videoFile: File
  onComplete: (result: FrameResult | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [phase, setPhase] = useState<SelectorPhase>('loading')
  const [loadingFrames, setLoadingFrames] = useState(false)
  const [roi, setRoi] = useState<Rect | null>(null)
  const [dragStart, setDragStart] = useState<Pt | null>(null)
  const [dragCurrent, setDragCurrent] = useState<Pt | null>(null)
  const [athleteBox, setAthleteBox] = useState<Rect | null>(null)
  const [canvasDims, setCanvasDims] = useState({ w: 0, h: 0 })

  useEffect(() => {
    extractFramesAt(videoFile, [0.08, 0.25, 0.5, 0.75])
      .then(f => { setFrames(f); setPhase('pick-frame') })
      .catch(() => setPhase('pick-frame'))
  }, [videoFile])

  // Sync canvas pixel dimensions to the rendered container using the frame's
  // known aspect ratio, so we don't depend on img layout timing.
  const selectedFrame = selectedIdx !== null ? frames[selectedIdx] : null
  useEffect(() => {
    if (!selectedFrame) return
    const id = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const container = canvas.parentElement
      if (!container) return
      const containerW = container.getBoundingClientRect().width
      if (containerW === 0) return
      const ratio = selectedFrame.naturalH / selectedFrame.naturalW
      const w = Math.round(containerW)
      const h = Math.round(containerW * ratio)
      canvas.width = w
      canvas.height = h
      setCanvasDims({ w, h })
    })
    return () => cancelAnimationFrame(id)
  }, [selectedFrame])

  async function refreshFrames() {
    setLoadingFrames(true)
    setSelectedIdx(null)
    setRoi(null); setDragStart(null); setDragCurrent(null); setAthleteBox(null)
    setPhase('pick-frame')
    onComplete(null)
    try {
      const newFrames = await extractFramesAt(videoFile, randomFractions(), [3, 8, 16])
      setFrames(newFrames)
    } finally {
      setLoadingFrames(false)
    }
  }

  function selectFrame(idx: number) {
    setSelectedIdx(idx)
    setRoi(null); setDragStart(null); setDragCurrent(null); setAthleteBox(null)
    setCanvasDims({ w: 0, h: 0 })
    setPhase('draw-roi')
    onComplete(null)
  }

  // Redraw canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || canvasDims.w === 0) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    // Green ROI box — use committed roi or live drag in draw-roi phase
    const activeRoi: Rect | null = roi
      ?? (phase === 'draw-roi' && dragStart && dragCurrent
          ? { x1: dragStart.x, y1: dragStart.y, x2: dragCurrent.x, y2: dragCurrent.y }
          : null)

    if (!activeRoi) return

    const rx = Math.min(activeRoi.x1, activeRoi.x2) * W
    const ry = Math.min(activeRoi.y1, activeRoi.y2) * H
    const rw = Math.abs(activeRoi.x2 - activeRoi.x1) * W
    const rh = Math.abs(activeRoi.y2 - activeRoi.y1) * H

    ctx.fillStyle = 'rgba(0,0,0,0.52)'
    ctx.fillRect(0, 0, W, ry)
    ctx.fillRect(0, ry + rh, W, H - ry - rh)
    ctx.fillRect(0, ry, rx, rh)
    ctx.fillRect(rx + rw, ry, W - rx - rw, rh)

    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 2
    ctx.strokeRect(rx, ry, rw, rh)

    // Red athlete box — use committed box or live drag in mark-athlete phase
    const activeAthleteBox: Rect | null = athleteBox
      ?? (phase === 'mark-athlete' && dragStart && dragCurrent
          ? { x1: Math.min(dragStart.x, dragCurrent.x), y1: Math.min(dragStart.y, dragCurrent.y),
              x2: Math.max(dragStart.x, dragCurrent.x), y2: Math.max(dragStart.y, dragCurrent.y) }
          : null)

    if (activeAthleteBox) {
      const ax = activeAthleteBox.x1 * W
      const ay = activeAthleteBox.y1 * H
      const aw = (activeAthleteBox.x2 - activeAthleteBox.x1) * W
      const ah = (activeAthleteBox.y2 - activeAthleteBox.y1) * H
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2.5
      ctx.setLineDash([6, 3])
      ctx.strokeRect(ax, ay, aw, ah)
      ctx.setLineDash([])
      // "YOU" label above the box
      ctx.font = 'bold 11px sans-serif'
      const lw = ctx.measureText('YOU').width
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.roundRect(ax, ay - 20, lw + 10, 20, [3, 3, 0, 0])
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('YOU', ax + 5, ay - 10)
    }
  }, [roi, dragStart, dragCurrent, athleteBox, canvasDims, phase])

  function getPoint(e: React.MouseEvent<HTMLCanvasElement>): Pt {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (phase !== 'draw-roi' && phase !== 'mark-athlete') return
    e.preventDefault()
    setDragStart(getPoint(e))
    setDragCurrent(null)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if ((phase !== 'draw-roi' && phase !== 'mark-athlete') || !dragStart) return
    setDragCurrent(getPoint(e))
  }

  async function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragStart) return
    const end = getPoint(e)

    if (phase === 'draw-roi') {
      if (Math.abs(end.x - dragStart.x) < 0.04 || Math.abs(end.y - dragStart.y) < 0.04) {
        setDragStart(null); setDragCurrent(null); return
      }
      setRoi({ x1: dragStart.x, y1: dragStart.y, x2: end.x, y2: end.y })
      setDragStart(null); setDragCurrent(null)
      setPhase('mark-athlete')
    } else if (phase === 'mark-athlete' && roi && selectedFrame) {
      if (Math.abs(end.x - dragStart.x) < 0.03 || Math.abs(end.y - dragStart.y) < 0.03) {
        setDragStart(null); setDragCurrent(null); return
      }
      const box: Rect = {
        x1: Math.min(dragStart.x, end.x), y1: Math.min(dragStart.y, end.y),
        x2: Math.max(dragStart.x, end.x), y2: Math.max(dragStart.y, end.y),
      }
      const normalizedRoi: Rect = {
        x1: Math.min(roi.x1, roi.x2), y1: Math.min(roi.y1, roi.y2),
        x2: Math.max(roi.x1, roi.x2), y2: Math.max(roi.y1, roi.y2),
      }
      setAthleteBox(box)
      setDragStart(null); setDragCurrent(null)
      setPhase('done')
      const athleteImageBase64 = await buildAnnotatedRefImageBase64(selectedFrame, normalizedRoi, box)
      onComplete({ spatialHint: buildSpatialHint(normalizedRoi, box), athleteImageBase64, spatialData: { roi: normalizedRoi, athlete: box } })
    }
  }

  function reset() {
    setSelectedIdx(null)
    setRoi(null); setDragStart(null); setDragCurrent(null); setAthleteBox(null)
    setPhase('pick-frame')
    onComplete(null)
  }

  if (phase === 'loading') {
    return (
      <div className="rounded-md border bg-muted/30 h-20 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Extracting frames…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Frame strip — always shown in pick-frame and done phases */}
      {(phase === 'pick-frame' || phase === 'done') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {phase === 'done'
                ? 'Position captured — click a frame to redo'
                : 'Pick the clearest frame where you can see yourself on the mat'}
            </p>
            <button
              type="button"
              onClick={refreshFrames}
              disabled={loadingFrames}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              {loadingFrames ? 'Loading…' : '↻ New frames'}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 items-end">
            {frames.map((f, i) => {
              const isFirstMatch = f.label !== 'entry' && (i === 0 || frames[i - 1].label === 'entry')
              return (
                <div key={i} className="flex items-end gap-2 flex-shrink-0">
                  {/* Divider between entry and match frames */}
                  {isFirstMatch && frames.some(fr => fr.label === 'entry') && (
                    <div className="self-stretch flex flex-col items-center justify-center gap-1 px-0.5">
                      <div className="w-px h-full bg-border" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => selectFrame(i)}
                    className={`relative rounded overflow-hidden border-2 transition-all ${
                      selectedIdx === i && phase === 'done' ? 'border-green-500' : 'border-transparent hover:border-foreground/40'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.dataUrl} alt={`Frame ${i + 1}`} className="h-20 w-auto object-cover block" draggable={false} />
                    {f.label === 'entry' && (
                      <span className="absolute bottom-1 left-1 text-[9px] font-bold uppercase bg-emerald-500 text-white px-1 py-0.5 rounded leading-none tracking-wide">
                        Entry
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
          {frames.some(f => f.label === 'entry') && phase === 'pick-frame' && (
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400 font-medium">Entry frames</span> show athletes walking onto the mat — easiest to identify yourself before the match starts.
            </p>
          )}
          {phase === 'done' && (
            <p className="text-xs text-emerald-400 font-medium">Position captured — identity reference saved.</p>
          )}
        </div>
      )}

      {/* Interactive canvas — shown only while drawing */}
      {selectedFrame && phase !== 'pick-frame' && phase !== 'done' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {phase === 'draw-roi' && 'Step 1 of 2 — Drag to draw a green box around your mat'}
              {phase === 'mark-athlete' && 'Step 2 of 2 — Drag to draw a red box around yourself'}
            </p>
            <button type="button" onClick={reset} className="text-xs text-muted-foreground hover:text-foreground underline transition-colors">
              Change frame
            </button>
          </div>
          <div className="relative rounded-md overflow-hidden border select-none bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedFrame.dataUrl}
              alt="Selected frame"
              className="w-full block"
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: 'crosshair' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {phase === 'draw-roi' && 'Outline the mat — the AI will ignore other matches in the background.'}
            {phase === 'mark-athlete' && 'Draw a tight red box around yourself — this photo is sent to the AI as your visual reference.'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── File upload tab ──────────────────────────────────────────────────────────

function FileUploadTab() {
  const [file, setFile] = useState<File | null>(null)
  const [frameResult, setFrameResult] = useState<FrameResult | null>(null)
  const [scanMode, setScanMode] = useState<ScanMode>('single')
  const [athleteName, setAthleteName] = useState('')
  const [eventName, setEventName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('own_competition')
  const [format, setFormat] = useState<Format>('gi')
  const [appearanceColor, setAppearanceColor] = useState<AppearanceColor | null>(null)
  const [startingSide, setStartingSide] = useState<StartingSide | null>(null)
  const [startingSideAuto, setStartingSideAuto] = useState(false)
  const [selfDescription, setSelfDescription] = useState('')
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  function pickFile(f: File) {
    if (!f.type.startsWith('video/')) { setError('Only video files are accepted'); return }
    if (f.size > 2 * 1024 * 1024 * 1024) { setError('File must be under 2 GB'); return }
    setFile(f)
    setFrameResult(null)
    setStartingSideAuto(false)
    setError(null)
  }

  function handleFrameComplete(result: FrameResult | null) {
    setFrameResult(result)
    if (result?.spatialData) {
      const { x1, x2 } = result.spatialData.athlete
      const centerX = (x1 + x2) / 2
      const autoSide: StartingSide = centerX < 0.5 ? 'left' : 'right'
      setStartingSide(autoSide)
      setStartingSideAuto(true)
    } else {
      setStartingSideAuto(false)
    }
  }

  async function upload() {
    if (!file) return
    if (scanMode === 'scan' && !athleteName.trim()) { setError('Athlete name is required for full mat scan'); return }
    setState('uploading'); setProgress(0); setError(null)

    const appearanceStr = buildAppearanceHint(appearanceColor, startingSide)
    const hint = [selfDescription.trim(), appearanceStr, frameResult?.spatialHint].filter(Boolean).join(' ')
    const durationSeconds = await getVideoDuration(file)

    try {
      const presignRes = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, sourceType, format }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) { setError(presignData.error ?? 'Failed to prepare upload'); setState('error'); return }

      const { uploadUrl, path, videoId } = presignData

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      const completeRes = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId, path, sourceType, format,
          appearanceHint: hint || undefined,
          athleteImageBase64: frameResult?.athleteImageBase64 || undefined,
          spatialData: frameResult?.spatialData || undefined,
          durationSeconds: durationSeconds ?? undefined,
          scanMode,
          ...(scanMode === 'scan' ? { athleteName: athleteName.trim(), eventName: eventName.trim() || undefined } : {}),
        }),
      })
      if (!completeRes.ok) {
        const d = await completeRes.json().catch(() => ({}))
        setError(d.error ?? 'Upload complete but analysis could not start')
        setState('error'); return
      }
      setState('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/40 p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        {scanMode === 'scan' ? (
          <>
            <p className="font-medium text-emerald-400">Scanning for {athleteName}&apos;s matches…</p>
            <p className="text-sm text-muted-foreground">Gemini will find all matches in the recording. This may take several minutes.</p>
          </>
        ) : (
          <>
            <p className="font-medium text-emerald-400">Video uploaded — analysis starting shortly.</p>
            <p className="text-sm text-muted-foreground">You&apos;ll see it appear in your Match Feed.</p>
          </>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => { setFile(null); setFrameResult(null); setState('idle'); setProgress(0); setAthleteName(''); setEventName('') }}>Upload another</Button>
          <Button onClick={() => router.push('/player-card')}>View My Stats</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div
        className={`rounded-lg border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${isDragging ? 'border-foreground bg-muted' : 'border-muted-foreground/30 hover:border-muted-foreground/60'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f) }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />
        {file ? (
          <div className="space-y-1">
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-medium">Drag & drop your video here</p>
            <p className="text-sm text-muted-foreground">or click to browse — MP4, MOV, AVI up to 2 GB</p>
          </div>
        )}
      </div>

      {file && <FrameSelector videoFile={file} onComplete={handleFrameComplete} />}

      <div className="space-y-3">
        <label className="text-sm font-medium">Recording type</label>
        <div className="flex rounded-lg border overflow-hidden">
          {(['single', 'scan'] as ScanMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => setScanMode(mode)}
              className={`flex-1 py-2 text-sm transition-colors ${scanMode === mode ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}>
              {mode === 'single' ? 'Single match clip' : 'Full mat / session'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {scanMode === 'single' ? 'The whole video contains one match.' : 'Gemini scans the full recording and extracts every match for the specified athlete.'}
        </p>
      </div>

      {scanMode === 'scan' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Athlete name <span className="text-red-500">*</span></label>
            <Input type="text" value={athleteName} onChange={(e) => setAthleteName(e.target.value)}
              placeholder="Name as shown on screen (e.g. David Smith)" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Event name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Pan Ams 2026" />
          </div>
        </div>
      )}

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType}
        appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
        startingSide={startingSide}
        setStartingSide={(s) => { setStartingSide(s); setStartingSideAuto(false) }}
        startingSideAuto={startingSideAuto}
        selfDescription={selfDescription} setSelfDescription={setSelfDescription} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {state === 'uploading' && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      <Button onClick={upload} disabled={!file || state === 'uploading'} className="w-full" size="lg">
        {state === 'uploading' ? 'Uploading…' : 'Upload Video'}
      </Button>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        Your video is uploaded to secure cloud storage and processed by{' '}
        <span className="font-medium text-foreground/70">Google Gemini AI</span>.
        You can delete your video and all analysis data at any time from the match page.
      </p>
    </div>
  )
}

// ─── URL analysis tab ─────────────────────────────────────────────────────────

function UrlAnalysisTab() {
  const [athleteName, setAthleteName] = useState('')
  const [eventName, setEventName] = useState('')
  const [urls, setUrls] = useState([''])
  const [sourceType, setSourceType] = useState<SourceType>('own_competition')
  const [format, setFormat] = useState<Format>('gi')
  const [appearanceColor, setAppearanceColor] = useState<AppearanceColor | null>(null)
  const [startingSide, setStartingSide] = useState<StartingSide | null>(null)
  const [selfDescription, setSelfDescription] = useState('')
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function updateUrl(i: number, val: string) { setUrls((prev) => prev.map((u, idx) => idx === i ? val : u)) }
  function addUrl() { if (urls.length < 10) setUrls((prev) => [...prev, '']) }
  function removeUrl(i: number) { setUrls((prev) => prev.filter((_, idx) => idx !== i)) }

  async function submit() {
    const validUrls = urls.map((u) => u.trim()).filter(Boolean)
    if (!athleteName.trim()) { setError('Athlete name is required'); return }
    if (validUrls.length === 0) { setError('At least one URL is required'); return }
    setState('uploading'); setError(null)
    try {
      const res = await fetch('/api/analyse-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          athleteName: athleteName.trim(), urls: validUrls, format, sourceType,
          eventName: eventName.trim() || undefined,
          appearanceHint: [selfDescription.trim(), buildAppearanceHint(appearanceColor, startingSide)].filter(Boolean).join(' ') || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); setState('error'); return }
      setState('success')
    } catch {
      setError('Network error — check your connection'); setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/40 p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <p className="font-medium text-emerald-400">{urls.filter(Boolean).length} stream{urls.filter(Boolean).length > 1 ? 's' : ''} submitted for analysis!</p>
        <p className="text-sm text-muted-foreground">Gemini will scan for {athleteName}&apos;s matches. This may take several minutes.</p>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => { setUrls(['']); setAthleteName(''); setEventName(''); setState('idle') }}>Submit more</Button>
          <Button onClick={() => router.push('/player-card')}>View My Stats</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Athlete name <span className="text-red-500">*</span></label>
        <Input type="text" value={athleteName} onChange={(e) => setAthleteName(e.target.value)}
          placeholder="Name as shown on screen (e.g. David Smith)" />
        <p className="text-xs text-muted-foreground">Must match exactly what appears in the tournament overlay</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Event name <span className="text-muted-foreground font-normal">(optional)</span></label>
        <Input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
          placeholder="e.g. Pan Ams 2026, IBJJF Worlds 2026" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Stream URLs <span className="text-red-500">*</span></label>
        <div className="space-y-3">
          {urls.map((url, i) => {
            const ytId = extractYouTubeId(url.trim())
            return (
              <div key={i} className="space-y-2">
                <div className="flex gap-2">
                  <Input type="url" value={url} onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or direct video URL"
                    className="flex-1" />
                  {urls.length > 1 && (
                    <Button variant="outline" onClick={() => removeUrl(i)}>✕</Button>
                  )}
                </div>
                {ytId && (
                  <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="YouTube thumbnail"
                      className="w-24 h-14 object-cover rounded flex-shrink-0 bg-muted" />
                    <p className="text-xs text-muted-foreground">
                      Use the appearance options below to tell the AI which athlete is <strong>you</strong> in this video.
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {urls.length < 10 && (
          <button onClick={addUrl} className="text-sm text-muted-foreground hover:text-foreground transition-colors">+ Add another URL</button>
        )}
        <p className="text-xs text-muted-foreground">YouTube or direct video links. Maximum ~1 hour per URL.</p>
      </div>

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType}
        appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
        startingSide={startingSide} setStartingSide={setStartingSide}
        selfDescription={selfDescription} setSelfDescription={setSelfDescription} />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} disabled={state === 'uploading'} className="w-full shadow-[0_0_20px_rgba(180,130,20,0.25)]" size="lg">
        {state === 'uploading' ? 'Submitting…' : 'Analyse Stream'}
      </Button>
    </div>
  )
}

// ─── Shared fields ────────────────────────────────────────────────────────────

function SharedFields({
  format, setFormat, sourceType, setSourceType,
  appearanceColor, setAppearanceColor, startingSide, setStartingSide,
  startingSideAuto = false,
  selfDescription, setSelfDescription,
}: {
  format: Format; setFormat: (f: Format) => void
  sourceType: SourceType; setSourceType: (s: SourceType) => void
  appearanceColor: AppearanceColor | null; setAppearanceColor: (c: AppearanceColor | null) => void
  startingSide: StartingSide | null; setStartingSide: (s: StartingSide | null) => void
  startingSideAuto?: boolean
  selfDescription: string; setSelfDescription: (v: string) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-sm font-medium">Describe yourself in the video <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
        <textarea
          value={selfDescription}
          onChange={(e) => setSelfDescription(e.target.value)}
          rows={2}
          placeholder="e.g. I am wearing a black gi, standing on the left side. The referee is in white."
          className="w-full rounded-md border bg-muted text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        />
        <p className="text-xs text-muted-foreground">Free text hint to help the AI distinguish you from opponents and referees.</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">What are you wearing? <span className="text-muted-foreground font-normal text-xs">(optional)</span></label>
          <p className="text-xs text-muted-foreground mt-0.5">Extra hint alongside the frame selection above</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => setAppearanceColor(appearanceColor === opt.value ? null : opt.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all ${appearanceColor === opt.value ? 'border-primary bg-primary text-primary-foreground font-medium' : 'border-border hover:border-foreground/40'}`}>
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.bg}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['left', 'right'] as StartingSide[]).map((side) => (
            <button key={side} type="button"
              onClick={() => setStartingSide(startingSide === side ? null : side)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all ${startingSide === side ? 'border-primary bg-primary text-primary-foreground font-medium' : 'border-border hover:border-foreground/40'}`}>
              {side === 'left' ? '← ' : '→ '}Starts {side}
              {startingSide === side && startingSideAuto && (
                <span className="text-[10px] opacity-70 font-normal">(auto)</span>
              )}
            </button>
          ))}
          <span className="self-center text-xs text-muted-foreground">side of the mat</span>
        </div>
        {startingSideAuto && startingSide && (
          <p className="text-xs text-emerald-400">
            Auto-detected from your frame selection — tap to override.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Format</label>
        <div className="flex gap-4">
          {(['gi', 'no_gi'] as Format[]).map((f) => (
            <label key={f} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} className="accent-primary" />
              <span className="text-sm">{f === 'gi' ? 'Gi' : 'No-Gi'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Footage type</label>
        <div className="flex flex-col gap-2">
          {(Object.keys(SOURCE_LABELS) as SourceType[]).map((type) => (
            <label key={type} className="flex items-center gap-3 cursor-pointer">
              <input type="radio" name="sourceType" value={type} checked={sourceType === type} onChange={() => setSourceType(type)} className="accent-primary" />
              <span className="text-sm">{SOURCE_LABELS[type]}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('file')
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analyse My Match</h1>
        <p className="text-sm text-muted-foreground mt-1">Your footage will be processed by <span className="font-medium text-foreground/70">Google Gemini AI</span>. You can delete it at any time.</p>
      </div>
      <div className="flex rounded-lg border overflow-hidden">
        {(['file', 'url'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
            {t === 'file' ? 'Upload File' : 'Analyse Stream URL'}
          </button>
        ))}
      </div>
      {tab === 'file' ? <FileUploadTab /> : <UrlAnalysisTab />}
    </div>
  )
}
