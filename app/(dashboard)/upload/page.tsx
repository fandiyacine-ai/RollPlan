'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'file' | 'url'
type ScanMode = 'single' | 'scan'
type SourceType = 'own_competition' | 'own_sparring' | 'opponent'
type Format = 'gi' | 'no_gi'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'
type AppearanceColor = 'blue_gi' | 'white_gi' | 'dark_rash' | 'light_rash' | 'other'
type StartingSide = 'left' | 'right'

const SOURCE_LABELS: Record<SourceType, string> = {
  own_competition: 'My competition match',
  own_sparring: 'My sparring session',
  opponent: 'Opponent footage',
}

const COLOR_OPTIONS: { value: AppearanceColor; label: string; bg: string }[] = [
  { value: 'blue_gi',    label: 'Blue Gi',    bg: 'bg-blue-600' },
  { value: 'white_gi',   label: 'White Gi',   bg: 'bg-white border border-gray-300' },
  { value: 'dark_rash',  label: 'Dark Rash',  bg: 'bg-gray-800' },
  { value: 'light_rash', label: 'Light Rash', bg: 'bg-gray-200 border border-gray-300' },
  { value: 'other',      label: 'Other',      bg: 'bg-gradient-to-br from-purple-400 to-pink-400' },
]

const COLOR_HINT: Record<AppearanceColor, string> = {
  blue_gi: 'blue gi', white_gi: 'white gi', dark_rash: 'dark rashguard',
  light_rash: 'light rashguard', other: 'other-coloured kit',
}

function buildAppearanceHint(color: AppearanceColor | null, side: StartingSide | null): string {
  const parts: string[] = []
  if (color) parts.push(COLOR_HINT[color])
  if (side) parts.push(`starts on the ${side} side of the mat`)
  return parts.join(', ')
}

function FileUploadTab() {
  const [file, setFile] = useState<File | null>(null)
  const [scanMode, setScanMode] = useState<ScanMode>('single')
  const [athleteName, setAthleteName] = useState('')
  const [eventName, setEventName] = useState('')
  const [sourceType, setSourceType] = useState<SourceType>('own_competition')
  const [format, setFormat] = useState<Format>('gi')
  const [appearanceColor, setAppearanceColor] = useState<AppearanceColor | null>(null)
  const [startingSide, setStartingSide] = useState<StartingSide | null>(null)
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
    setError(null)
  }

  async function upload() {
    if (!file) return
    if (scanMode === 'scan' && !athleteName.trim()) { setError('Athlete name is required for full mat scan'); return }
    setState('uploading')
    setProgress(0)
    setError(null)

    const hint = buildAppearanceHint(appearanceColor, startingSide)

    try {
      // Step 1: get a presigned R2 upload URL
      const presignRes = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, sourceType, format }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) { setError(presignData.error ?? 'Failed to prepare upload'); setState('error'); return }

      const { uploadUrl, path, videoId } = presignData

      // Step 2: upload directly to R2 (bypasses Railway — no size limit)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      // Step 3: notify server to set publicUrl and trigger analysis
      const completeRes = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId, path, sourceType, format,
          appearanceHint: hint || undefined,
          scanMode,
          ...(scanMode === 'scan' ? { athleteName: athleteName.trim(), eventName: eventName.trim() || undefined } : {}),
        }),
      })
      if (!completeRes.ok) {
        const d = await completeRes.json().catch(() => ({}))
        setError(d.error ?? 'Upload complete but analysis could not start')
        setState('error')
        return
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
          <button onClick={() => { setFile(null); setState('idle'); setProgress(0); setAthleteName(''); setEventName('') }} className="px-4 py-2 rounded-md border text-sm hover:bg-muted transition-colors">Upload another</button>
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

      <div className="space-y-3">
        <label className="text-sm font-medium">Recording type</label>
        <div className="flex rounded-lg border overflow-hidden">
          {(['single', 'scan'] as ScanMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setScanMode(mode)}
              className={`flex-1 py-2 text-sm transition-colors ${scanMode === mode ? 'bg-foreground text-background font-medium' : 'hover:bg-muted'}`}
            >
              {mode === 'single' ? 'Single match clip' : 'Full mat / session'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {scanMode === 'single'
            ? 'The whole video contains one match.'
            : 'Gemini scans the full recording and extracts every match for the specified athlete.'}
        </p>
      </div>

      {scanMode === 'scan' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Athlete name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={athleteName}
              onChange={(e) => setAthleteName(e.target.value)}
              placeholder="Name as shown on screen (e.g. David Smith)"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Event name <span className="text-muted-foreground font-normal">(optional)</span></label>
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Pan Ams 2026"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>
      )}

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType}
        appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
        startingSide={startingSide} setStartingSide={setStartingSide} />

      {error && <p className="text-sm text-red-500">{error}</p>}

      {state === 'uploading' && (
        <div className="space-y-1">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-foreground transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-right">{progress}%</p>
        </div>
      )}

      <button onClick={upload} disabled={!file || state === 'uploading'} className="w-full py-2.5 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
        {state === 'uploading' ? 'Uploading…' : 'Upload Video'}
      </button>
    </div>
  )
}

function UrlAnalysisTab() {
  const [athleteName, setAthleteName] = useState('')
  const [eventName, setEventName] = useState('')
  const [urls, setUrls] = useState([''])
  const [sourceType, setSourceType] = useState<SourceType>('own_competition')
  const [format, setFormat] = useState<Format>('gi')
  const [appearanceColor, setAppearanceColor] = useState<AppearanceColor | null>(null)
  const [startingSide, setStartingSide] = useState<StartingSide | null>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function updateUrl(i: number, val: string) {
    setUrls((prev) => prev.map((u, idx) => (idx === i ? val : u)))
  }

  function addUrl() {
    if (urls.length < 10) setUrls((prev) => [...prev, ''])
  }

  function removeUrl(i: number) {
    setUrls((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function submit() {
    const validUrls = urls.map((u) => u.trim()).filter(Boolean)
    if (!athleteName.trim()) { setError('Athlete name is required'); return }
    if (validUrls.length === 0) { setError('At least one URL is required'); return }

    setState('uploading')
    setError(null)

    try {
      const res = await fetch('/api/analyse-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ athleteName: athleteName.trim(), urls: validUrls, format, sourceType, eventName: eventName.trim() || undefined, appearanceHint: buildAppearanceHint(appearanceColor, startingSide) || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Submission failed'); setState('error'); return }
      setState('success')
    } catch {
      setError('Network error — check your connection')
      setState('error')
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
        <input
          type="text"
          value={athleteName}
          onChange={(e) => setAthleteName(e.target.value)}
          placeholder="Name as shown on screen (e.g. David Smith)"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <p className="text-xs text-muted-foreground">Must match exactly what appears in the tournament overlay (Smoothcomp, IBJJF scoreboard, etc.)</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Event name <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input
          type="text"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder="e.g. Pan Ams 2026, IBJJF Worlds 2026"
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Stream URLs <span className="text-red-500">*</span></label>
        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => updateUrl(i, e.target.value)}
                placeholder="https://youtube.com/watch?v=... or direct video URL"
                className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              {urls.length > 1 && (
                <button onClick={() => removeUrl(i)} className="px-3 py-2 rounded-md border text-sm text-muted-foreground hover:bg-muted transition-colors">✕</button>
              )}
            </div>
          ))}
        </div>
        {urls.length < 10 && (
          <button onClick={addUrl} className="text-sm text-muted-foreground hover:text-foreground transition-colors">+ Add another URL</button>
        )}
        <p className="text-xs text-muted-foreground">YouTube or direct video links. Maximum ~1 hour per URL — for full tournament streams, split by mat or time block.</p>
      </div>

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType}
        appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
        startingSide={startingSide} setStartingSide={setStartingSide} />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={state === 'uploading'}
        className="w-full py-2.5 rounded-md bg-foreground text-background text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {state === 'uploading' ? 'Submitting…' : 'Analyse Stream'}
      </button>
    </div>
  )
}

function SharedFields({
  format, setFormat, sourceType, setSourceType,
  appearanceColor, setAppearanceColor, startingSide, setStartingSide,
}: {
  format: Format; setFormat: (f: Format) => void
  sourceType: SourceType; setSourceType: (s: SourceType) => void
  appearanceColor: AppearanceColor | null; setAppearanceColor: (c: AppearanceColor | null) => void
  startingSide: StartingSide | null; setStartingSide: (s: StartingSide | null) => void
}) {
  return (
    <>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">What are you wearing?</label>
          <p className="text-xs text-muted-foreground mt-0.5">Helps the AI pick the right athlete in the video</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAppearanceColor(appearanceColor === opt.value ? null : opt.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all ${
                appearanceColor === opt.value
                  ? 'border-foreground bg-foreground text-background font-medium'
                  : 'border-border hover:border-foreground/40'
              }`}
            >
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${opt.bg}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(['left', 'right'] as StartingSide[]).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setStartingSide(startingSide === side ? null : side)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all ${
                startingSide === side
                  ? 'border-foreground bg-foreground text-background font-medium'
                  : 'border-border hover:border-foreground/40'
              }`}
            >
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

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('file')

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Add Match Footage</h1>

      <div className="flex rounded-lg border overflow-hidden">
        {(['file', 'url'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === t ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
          >
            {t === 'file' ? 'Upload File' : 'Analyse Stream URL'}
          </button>
        ))}
      </div>

      {tab === 'file' ? <FileUploadTab /> : <UrlAnalysisTab />}
    </div>
  )
}
