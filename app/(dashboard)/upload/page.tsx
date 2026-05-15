'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'file' | 'url'
type SourceType = 'own_competition' | 'own_sparring' | 'opponent'
type Format = 'gi' | 'no_gi'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'

const SOURCE_LABELS: Record<SourceType, string> = {
  own_competition: 'My competition match',
  own_sparring: 'My sparring session',
  opponent: 'Opponent footage',
}

function FileUploadTab() {
  const [file, setFile] = useState<File | null>(null)
  const [sourceType, setSourceType] = useState<SourceType>('own_competition')
  const [format, setFormat] = useState<Format>('gi')
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
    setState('uploading')
    setProgress(0)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('sourceType', sourceType)
    formData.append('format', format)

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setState('success')
          resolve()
        } else {
          const msg = (() => { try { return JSON.parse(xhr.responseText)?.error } catch { return null } })() ?? 'Upload failed'
          setError(msg)
          setState('error')
          reject()
        }
      }
      xhr.onerror = () => { setError('Network error — check your connection'); setState('error'); reject() }
      xhr.open('POST', '/api/uploads')
      xhr.send(formData)
    }).catch(() => {})
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center space-y-4">
        <div className="text-4xl">✓</div>
        <p className="font-medium text-green-800">Video uploaded successfully!</p>
        <p className="text-sm text-muted-foreground">Analysis will begin shortly.</p>
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => { setFile(null); setState('idle'); setProgress(0) }} className="px-4 py-2 rounded-md border text-sm hover:bg-muted transition-colors">Upload another</button>
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

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType} />

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
        body: JSON.stringify({ athleteName: athleteName.trim(), urls: validUrls, format, sourceType, eventName: eventName.trim() || undefined }),
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
        <p className="text-xs text-muted-foreground">YouTube or direct video links. Maximum 3 hours per URL — for longer events, split by mat or time block.</p>
      </div>

      <SharedFields format={format} setFormat={setFormat} sourceType={sourceType} setSourceType={setSourceType} />

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

function SharedFields({ format, setFormat, sourceType, setSourceType }: {
  format: Format; setFormat: (f: Format) => void
  sourceType: SourceType; setSourceType: (s: SourceType) => void
}) {
  return (
    <>
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
