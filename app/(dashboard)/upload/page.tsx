'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'file' | 'url'
type ScanMode = 'single' | 'scan'
type SourceType = 'own_competition' | 'own_sparring' | 'opponent'
type Format = 'gi' | 'no_gi'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'
type AppearanceColor = 'blue_gi' | 'white_gi' | 'black_gi' | 'dark_rash' | 'light_rash' | 'other'
type StartingSide = 'left' | 'right'
type Rect = { x1: number; y1: number; x2: number; y2: number }
type Pt = { x: number; y: number }
type Frame = { dataUrl: string; naturalW: number; naturalH: number }
type FrameResult = { spatialHint: string; athleteImageBase64: string }

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

function buildSpatialHint(roi: Rect, athlete: Pt): string {
  const l = Math.round(Math.min(roi.x1, roi.x2) * 100)
  const r = Math.round(Math.max(roi.x1, roi.x2) * 100)
  const t = Math.round(Math.min(roi.y1, roi.y2) * 100)
  const b = Math.round(Math.max(roi.y1, roi.y2) * 100)
  const ax = Math.round(athlete.x * 100)
  const ay = Math.round(athlete.y * 100)
  const hPos = athlete.x < (Math.min(roi.x1, roi.x2) + Math.max(roi.x1, roi.x2)) / 2 ? 'left' : 'right'
  const vPos = athlete.y < (Math.min(roi.y1, roi.y2) + Math.max(roi.y1, roi.y2)) / 2 ? 'upper' : 'lower'
  return `Focus ONLY on the match within the region spanning ${l}%–${r}% of frame width and ${t}%–${b}% of frame height — ignore all athletes and matches outside this area. Within that mat, the competitor to track is on the ${hPos} ${vPos} side (full-frame position: ${ax}% from left, ${ay}% from top).`
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

async function extractFramesAt(file: File, fractions: number[]): Promise<Frame[]> {
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
    const frames: Frame[] = []
    for (const frac of fractions) {
      vid.currentTime = Math.max(0.5, duration * frac)
      await new Promise<void>((res) => { vid.onseeked = () => res() })
      const c = document.createElement('canvas')
      c.width = vid.videoWidth
      c.height = vid.videoHeight
      c.getContext('2d')!.drawImage(vid, 0, 0)
      frames.push({ dataUrl: c.toDataURL('image/jpeg', 0.75), naturalW: vid.videoWidth, naturalH: vid.videoHeight })
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

function cropFrame(frame: Frame, pt: Pt): Promise<string> {
  return new Promise((resolve, reject) => {
    const CROP = Math.min(240, frame.naturalW, frame.naturalH)
    const cx = Math.round(pt.x * frame.naturalW)
    const cy = Math.round(pt.y * frame.naturalH)
    const sx = Math.max(0, Math.min(cx - CROP / 2, frame.naturalW - CROP))
    const sy = Math.max(0, Math.min(cy - CROP / 2, frame.naturalH - CROP))
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = CROP; c.height = CROP
      c.getContext('2d')!.drawImage(img, sx, sy, CROP, CROP, 0, 0, CROP, CROP)
      resolve(c.toDataURL('image/jpeg', 0.8).replace(/^data:image\/jpeg;base64,/, ''))
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
  const justFinishedRoi = useRef(false)
  const [frames, setFrames] = useState<Frame[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [phase, setPhase] = useState<SelectorPhase>('loading')
  const [loadingFrames, setLoadingFrames] = useState(false)
  const [roi, setRoi] = useState<Rect | null>(null)
  const [dragStart, setDragStart] = useState<Pt | null>(null)
  const [dragCurrent, setDragCurrent] = useState<Pt | null>(null)
  const [athletePt, setAthletePt] = useState<Pt | null>(null)
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
    setRoi(null); setDragStart(null); setDragCurrent(null); setAthletePt(null)
    setPhase('pick-frame')
    onComplete(null)
    try {
      const newFrames = await extractFramesAt(videoFile, randomFractions())
      setFrames(newFrames)
    } finally {
      setLoadingFrames(false)
    }
  }

  function selectFrame(idx: number) {
    setSelectedIdx(idx)
    setRoi(null); setDragStart(null); setDragCurrent(null); setAthletePt(null)
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

    const activeRoi: Rect | null = roi
      ?? (dragStart && dragCurrent ? { x1: dragStart.x, y1: dragStart.y, x2: dragCurrent.x, y2: dragCurrent.y } : null)

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

    if (athletePt) {
      const px = athletePt.x * W
      const py = athletePt.y * H
      ctx.beginPath()
      ctx.arc(px, py, 22, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(239,68,68,0.45)'
      ctx.lineWidth = 6
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, py, 14, 0, Math.PI * 2)
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, Math.PI * 2)
      ctx.fillStyle = '#ef4444'
      ctx.fill()
      ctx.font = 'bold 11px sans-serif'
      const lw = ctx.measureText('YOU').width
      ctx.fillStyle = '#ef4444'
      ctx.beginPath()
      ctx.roundRect(px + 18, py - 9, lw + 10, 18, 3)
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText('YOU', px + 23, py)
    }
  }, [roi, dragStart, dragCurrent, athletePt, canvasDims])

  function getPoint(e: React.MouseEvent<HTMLCanvasElement>): Pt {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (phase !== 'draw-roi') return
    e.preventDefault()
    setDragStart(getPoint(e))
    setDragCurrent(null)
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (phase !== 'draw-roi' || !dragStart) return
    setDragCurrent(getPoint(e))
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (phase !== 'draw-roi' || !dragStart) return
    const end = getPoint(e)
    if (Math.abs(end.x - dragStart.x) < 0.04 || Math.abs(end.y - dragStart.y) < 0.04) {
      setDragStart(null); setDragCurrent(null); return
    }
    setRoi({ x1: dragStart.x, y1: dragStart.y, x2: end.x, y2: end.y })
    setDragStart(null); setDragCurrent(null)
    justFinishedRoi.current = true
    setPhase('mark-athlete')
  }

  async function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (justFinishedRoi.current) { justFinishedRoi.current = false; return }
    if (phase !== 'mark-athlete' || !roi || !selectedFrame) return
    const pt = getPoint(e)
    if (
      pt.x < Math.min(roi.x1, roi.x2) || pt.x > Math.max(roi.x1, roi.x2) ||
      pt.y < Math.min(roi.y1, roi.y2) || pt.y > Math.max(roi.y1, roi.y2)
    ) return
    setAthletePt(pt)
    setPhase('done')
    const athleteImageBase64 = await cropFrame(selectedFrame, pt)
    onComplete({ spatialHint: buildSpatialHint(roi, pt), athleteImageBase64 })
  }

  function reset() {
    setSelectedIdx(null)
    setRoi(null); setDragStart(null); setDragCurrent(null); setAthletePt(null)
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
          <div className="flex gap-2 overflow-x-auto pb-1">
            {frames.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectFrame(i)}
                className={`flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                  selectedIdx === i && phase === 'done' ? 'border-green-500' : 'border-transparent hover:border-foreground/40'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.dataUrl} alt={`Frame ${i + 1}`} className="h-20 w-auto object-cover block" draggable={false} />
              </button>
            ))}
          </div>
          {phase === 'done' && (
            <p className="text-xs text-green-700 font-medium">Mat region and athlete position saved.</p>
          )}
        </div>
      )}

      {/* Interactive canvas — shown only while drawing */}
      {selectedFrame && phase !== 'pick-frame' && phase !== 'done' && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">
              {phase === 'draw-roi' && 'Step 1 of 2 — Drag to draw a box around your mat'}
              {phase === 'mark-athlete' && 'Step 2 of 2 — Click on yourself inside the green box'}
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
              style={{ cursor: phase === 'draw-roi' ? 'crosshair' : 'pointer' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleClick}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {phase === 'draw-roi' && 'Outline the mat — the AI will ignore other matches in the background.'}
            {phase === 'mark-athlete' && 'Click directly on yourself inside the green box.'}
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
    setError(null)
  }

  async function upload() {
    if (!file) return
    if (scanMode === 'scan' && !athleteName.trim()) { setError('Athlete name is required for full mat scan'); return }
    setState('uploading'); setProgress(0); setError(null)

    const appearanceStr = buildAppearanceHint(appearanceColor, startingSide)
    const hint = [selfDescription.trim(), appearanceStr, frameResult?.spatialHint].filter(Boolean).join(' ')

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
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        {scanMode === 'scan' ? (
          <>
            <p className="font-medium text-green-800">Scanning for {athleteName}&apos;s matches…</p>
            <p className="text-sm text-muted-foreground">Gemini will find all matches in the recording. This may take several minutes.</p>
          </>
        ) : (
          <>
            <p className="font-medium text-green-800">Video uploaded successfully!</p>
            <p className="text-sm text-muted-foreground">Analysis will begin shortly.</p>
          </>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => { setFile(null); setFrameResult(null); setState('idle'); setProgress(0); setAthleteName(''); setEventName('') }}
            className="px-4 py-2 rounded-md border text-sm hover:bg-muted transition-colors">Upload another</button>
          <button onClick={() => router.push('/player-card')} className="px-4 py-2 rounded-md bg-foreground text-background text-sm hover:opacity-90 transition-opacity">View Player Card</button>
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

      {file && <FrameSelector videoFile={file} onComplete={setFrameResult} />}

      <div className="space-y-3">
        <label className="text-sm font-medium">Recording type</label>
        <div className="flex rounded-lg border overflow-hidden">
          {(['single', 'scan'] as ScanMode[]).map((mode) => (
            <button key={mode} type="button" onClick={() => setScanMode(mode)}
              className={`flex-1 py-2 text-sm transition-colors ${scanMode === mode ? 'bg-foreground text-background font-medium' : 'hover:bg-muted'}`}>
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
            <input type="text" value={athleteName} onChange={(e) => setAthleteName(e.target.value)}
              placeholder="Name as shown on screen (e.g. David Smith)"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Event name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Pan Ams 2026"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
          </div>
        </div>
      )}

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType}
        appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
        startingSide={startingSide} setStartingSide={setStartingSide}
        selfDescription={selfDescription} setSelfDescription={setSelfDescription} />

      {error && <p className="text-sm text-red-500">{error}</p>}

      {state === 'uploading' && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-foreground transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      <button onClick={upload} disabled={!file || state === 'uploading'}
        className="w-full py-2.5 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
        {state === 'uploading' ? 'Uploading…' : 'Upload Video'}
      </button>
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
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <p className="font-medium text-green-800">{urls.filter(Boolean).length} stream{urls.filter(Boolean).length > 1 ? 's' : ''} submitted for analysis!</p>
        <p className="text-sm text-muted-foreground">Gemini will scan for {athleteName}&apos;s matches. This may take several minutes.</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => { setUrls(['']); setAthleteName(''); setEventName(''); setState('idle') }} className="px-4 py-2 rounded-md border text-sm hover:bg-muted transition-colors">Submit more</button>
          <button onClick={() => router.push('/player-card')} className="px-4 py-2 rounded-md bg-foreground text-background text-sm hover:opacity-90 transition-opacity">View Player Card</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Athlete name <span className="text-red-500">*</span></label>
        <input type="text" value={athleteName} onChange={(e) => setAthleteName(e.target.value)}
          placeholder="Name as shown on screen (e.g. David Smith)"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
        <p className="text-xs text-muted-foreground">Must match exactly what appears in the tournament overlay</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Event name <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)}
          placeholder="e.g. Pan Ams 2026, IBJJF Worlds 2026"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Stream URLs <span className="text-red-500">*</span></label>
        <div className="space-y-3">
          {urls.map((url, i) => {
            const ytId = extractYouTubeId(url.trim())
            return (
              <div key={i} className="space-y-2">
                <div className="flex gap-2">
                  <input type="url" value={url} onChange={(e) => updateUrl(i, e.target.value)}
                    placeholder="https://youtube.com/watch?v=... or direct video URL"
                    className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                  {urls.length > 1 && (
                    <button onClick={() => removeUrl(i)} className="px-3 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted transition-colors">✕</button>
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

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button onClick={submit} disabled={state === 'uploading'}
        className="w-full py-2.5 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
        {state === 'uploading' ? 'Submitting…' : 'Analyse Stream'}
      </button>
    </div>
  )
}

// ─── Shared fields ────────────────────────────────────────────────────────────

function SharedFields({
  format, setFormat, sourceType, setSourceType,
  appearanceColor, setAppearanceColor, startingSide, setStartingSide,
  selfDescription, setSelfDescription,
}: {
  format: Format; setFormat: (f: Format) => void
  sourceType: SourceType; setSourceType: (s: SourceType) => void
  appearanceColor: AppearanceColor | null; setAppearanceColor: (c: AppearanceColor | null) => void
  startingSide: StartingSide | null; setStartingSide: (s: StartingSide | null) => void
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
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all ${appearanceColor === opt.value ? 'border-foreground bg-foreground text-background font-medium' : 'border-border hover:border-foreground/40'}`}>
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.bg}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['left', 'right'] as StartingSide[]).map((side) => (
            <button key={side} type="button"
              onClick={() => setStartingSide(startingSide === side ? null : side)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all ${startingSide === side ? 'border-foreground bg-foreground text-background font-medium' : 'border-border hover:border-foreground/40'}`}>
              {side === 'left' ? '← ' : '→ '}Starts {side}
            </button>
          ))}
          <span className="self-center text-xs text-muted-foreground">side of the mat</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Format</label>
        <div className="flex gap-4">
          {(['gi', 'no_gi'] as Format[]).map((f) => (
            <label key={f} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} className="accent-foreground" />
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
              <input type="radio" name="sourceType" value={type} checked={sourceType === type} onChange={() => setSourceType(type)} className="accent-foreground" />
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
      <h1 className="text-2xl font-bold">Add Match Footage</h1>
      <div className="flex rounded-lg border overflow-hidden">
        {(['file', 'url'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-foreground text-background' : 'hover:bg-muted'}`}>
            {t === 'file' ? 'Upload File' : 'Analyse Stream URL'}
          </button>
        ))}
      </div>
      {tab === 'file' ? <FileUploadTab /> : <UrlAnalysisTab />}
    </div>
  )
}
