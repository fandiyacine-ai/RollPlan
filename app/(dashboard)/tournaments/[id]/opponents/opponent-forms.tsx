'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { addOpponent, submitScoutUrls, deleteOpponent } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

type AppearanceColor = 'blue_gi' | 'white_gi' | 'black_gi' | 'dark_rash' | 'light_rash' | 'other'
type StartingSide = 'left' | 'right'
type ScoutMethod = 'single' | 'session' | null
type SingleMode = 'url' | 'upload'

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

function buildAppearanceHint(color: AppearanceColor | null, side: StartingSide | null, notes: string): string {
  const parts: string[] = []
  if (color) parts.push(COLOR_HINT[color])
  if (side) parts.push(`starts on the ${side} side of the mat`)
  if (notes.trim()) parts.push(notes.trim())
  return parts.join(', ')
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

// ── Appearance fields (shared between all modes) ──────────────────────────────

function AppearanceFields({
  format, setFormat,
  appearanceColor, setAppearanceColor,
  startingSide, setStartingSide,
  notes, setNotes,
}: {
  format: string; setFormat: (v: string) => void
  appearanceColor: AppearanceColor | null; setAppearanceColor: (v: AppearanceColor | null) => void
  startingSide: StartingSide | null; setStartingSide: (v: StartingSide | null) => void
  notes: string; setNotes: (v: string) => void
}) {
  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Format</label>
        <Select value={format} onValueChange={(v) => { if (v) setFormat(v) }}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gi">Gi</SelectItem>
            <SelectItem value="no_gi">No-Gi</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground font-medium">Opponent&apos;s appearance <span className="font-normal">(optional — helps the AI)</span></p>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAppearanceColor(appearanceColor === opt.value ? null : opt.value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-all ${
                appearanceColor === opt.value
                  ? 'border-primary bg-primary text-primary-foreground font-medium'
                  : 'border-border hover:border-foreground/40'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.bg}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(['left', 'right'] as StartingSide[]).map((side) => (
            <button
              key={side}
              type="button"
              onClick={() => setStartingSide(startingSide === side ? null : side)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition-all ${
                startingSide === side
                  ? 'border-primary bg-primary text-primary-foreground font-medium'
                  : 'border-border hover:border-foreground/40'
              }`}
            >
              {side === 'left' ? '← ' : '→ '}Starts {side}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Notes for AI <span className="font-normal">(optional — mat number, weight class, etc.)</span></label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Mat 3, beginners -70kg"
        />
      </div>
    </div>
  )
}

// ── Add opponent ──────────────────────────────────────────────────────────────

export function DeleteOpponentButton({ opponentId, tournamentId }: { opponentId: string; tournamentId: string }) {
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={async () => {
        if (!confirm('Delete this opponent and all their scouted footage? This cannot be undone.')) return
        setPending(true)
        await deleteOpponent(opponentId, tournamentId)
      }}
      disabled={pending}
      aria-label="Delete opponent"
      className="text-muted-foreground hover:text-rose-400 hover:bg-rose-950/30"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </Button>
  )
}

export function AddOpponentForm({ tournamentId }: { tournamentId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPending(false) }}>
      <DialogTrigger>
        <Button size="sm">+ Add Opponent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Opponent</DialogTitle>
        </DialogHeader>
        <form
          id="add-opponent-form"
          action={async (fd) => {
            setPending(true)
            await addOpponent(tournamentId, fd)
            setOpen(false)
            setPending(false)
          }}
          className="space-y-3"
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <Input name="name" required placeholder="e.g. João Silva" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Seeding notes</label>
            <Input name="notes" placeholder="e.g. #3 seed, black belt 5 years" />
          </div>
        </form>
        <DialogFooter>
          <DialogClose><Button variant="outline" type="button">Cancel</Button></DialogClose>
          <Button type="submit" form="add-opponent-form" disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Scout form ────────────────────────────────────────────────────────────────

export function ScoutForm({
  tournamentId,
  opponentId,
  opponentName,
  hasMatches = false,
}: {
  tournamentId: string
  opponentId: string
  opponentName: string
  hasMatches?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [method, setMethod] = useState<ScoutMethod>(null)
  const [singleMode, setSingleMode] = useState<SingleMode>('url')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // shared appearance state
  const [format, setFormat] = useState('gi')
  const [appearanceColor, setAppearanceColor] = useState<AppearanceColor | null>(null)
  const [startingSide, setStartingSide] = useState<StartingSide | null>(null)
  const [notes, setNotes] = useState('')

  // single match — URL (supports multiple rows)
  const [singleUrls, setSingleUrls] = useState<string[]>([''])

  // single match — file upload
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // session — multi-URL
  const [sessionUrls, setSessionUrls] = useState('')

  function handleClose(o: boolean) {
    setOpen(o)
    if (!o) {
      setPending(false); setMethod(null); setError(null)
      setSingleUrls(['']); setUploadFile(null); setUploadProgress(0)
      setSessionUrls(''); setAppearanceColor(null); setStartingSide(null); setNotes('')
    }
  }

  function pickFile(f: File) {
    if (!f.type.startsWith('video/')) { setError('Only video files are accepted'); return }
    if (f.size > 2 * 1024 * 1024 * 1024) { setError('File must be under 2 GB'); return }
    setUploadFile(f); setError(null)
  }

  async function submitSingleUrl() {
    const urls = singleUrls.map(u => u.trim()).filter(Boolean)
    if (urls.length === 0) { setError('At least one video URL is required'); return }
    for (const url of urls) {
      try { new URL(url) } catch { setError(`Invalid URL: ${url}`); return }
    }

    setPending(true); setError(null)
    try {
      const fd = new FormData()
      fd.set('urls', urls.join('\n'))
      fd.set('format', format)
      fd.set('appearanceHint', buildAppearanceHint(appearanceColor, startingSide, notes))
      await submitScoutUrls(tournamentId, opponentId, fd)
      setOpen(false); setDone(true); router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setPending(false)
    }
  }

  async function submitSingleUpload() {
    if (!uploadFile) { setError('Please select a file'); return }
    setPending(true); setError(null); setUploadProgress(0)

    try {
      const presignRes = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadFile.name, contentType: uploadFile.type, size: uploadFile.size, sourceType: 'opponent', format }),
      })
      const presignData = await presignRes.json()
      if (!presignRes.ok) throw new Error(presignData.error ?? 'Failed to prepare upload')

      const { uploadUrl, path, videoId } = presignData

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100)) }
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', uploadFile.type)
        xhr.send(uploadFile)
      })

      const completeRes = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId, path,
          sourceType: 'opponent',
          format,
          scanMode: 'scan',
          athleteName: opponentName,
          tournamentOpponentId: opponentId,
          appearanceHint: buildAppearanceHint(appearanceColor, startingSide, notes) || undefined,
        }),
      })
      if (!completeRes.ok) {
        const d = await completeRes.json().catch(() => ({}))
        throw new Error(d.error ?? 'Upload complete failed')
      }

      setOpen(false); setDone(true); router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setPending(false)
    }
  }

  async function submitSession() {
    const urls = sessionUrls.split('\n').map(u => u.trim()).filter(Boolean)
    if (urls.length === 0) { setError('At least one URL is required'); return }
    setPending(true); setError(null)
    try {
      const fd = new FormData()
      fd.set('urls', urls.join('\n'))
      fd.set('format', format)
      fd.set('appearanceHint', buildAppearanceHint(appearanceColor, startingSide, notes))
      await submitScoutUrls(tournamentId, opponentId, fd)
      setOpen(false); setDone(true); router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
      setPending(false)
    }
  }

  if (done) {
    return <span className="text-xs text-emerald-400 font-medium">Scanning queued ✓</span>
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger>
        <Button variant="outline" size="xs">{hasMatches ? '+ Add footage' : 'Scout footage'}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scout {opponentName}</DialogTitle>
        </DialogHeader>

        {/* Method picker */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMethod('single')}
            className={`rounded-xl border p-4 text-left transition-all space-y-1.5 ${
              method === 'single' ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              <span className="text-sm font-medium">Single Match</span>
            </div>
            <p className="text-xs text-muted-foreground">Upload a file or paste a video link</p>
          </button>

          <button
            type="button"
            onClick={() => setMethod('session')}
            className={`rounded-xl border p-4 text-left transition-all space-y-1.5 ${
              method === 'session' ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span className="text-sm font-medium">Mat Session</span>
            </div>
            <p className="text-xs text-muted-foreground">YouTube link — AI scans for all their matches</p>
          </button>
        </div>

        {/* Single match */}
        {method === 'single' && (
          <div className="space-y-4">
            {/* URL / Upload sub-tabs */}
            <div className="flex rounded-lg border overflow-hidden">
              {(['url', 'upload'] as SingleMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setSingleMode(m); setError(null) }}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                    singleMode === m ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {m === 'url' ? 'Video Link' : 'Upload File'}
                </button>
              ))}
            </div>

            {singleMode === 'url' && (
              <div className="space-y-2">
                {singleUrls.map((url, i) => {
                  const ytId = url.trim() ? extractYouTubeId(url.trim()) : null
                  return (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="url"
                          value={url}
                          onChange={(e) => {
                            const next = [...singleUrls]
                            next[i] = e.target.value
                            setSingleUrls(next)
                          }}
                          placeholder="https://youtube.com/watch?v=…"
                          className="flex-1"
                        />
                        {singleUrls.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSingleUrls(singleUrls.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 flex-shrink-0"
                            aria-label="Remove URL"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                      {ytId && (
                        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} alt="" className="w-14 h-9 object-cover rounded flex-shrink-0 bg-muted" />
                          <p className="text-xs text-muted-foreground">YouTube video detected</p>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setSingleUrls([...singleUrls, ''])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add another link
                </button>
              </div>
            )}

            {singleMode === 'upload' && (
              <div className="space-y-2">
                <div
                  className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                    isDragging ? 'border-foreground bg-muted' : 'border-muted-foreground/30 hover:border-muted-foreground/60'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) pickFile(f) }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }} />
                  {uploadFile ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Drop video here or click to browse</p>
                      <p className="text-xs text-muted-foreground/60">MP4, MOV, AVI · up to 2 GB</p>
                    </div>
                  )}
                </div>
                {pending && uploadProgress > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
                  </div>
                )}
              </div>
            )}

            <AppearanceFields
              format={format} setFormat={setFormat}
              appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
              startingSide={startingSide} setStartingSide={setStartingSide}
              notes={notes} setNotes={setNotes}
            />
          </div>
        )}

        {/* Mat session */}
        {method === 'session' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">YouTube URLs <span className="text-muted-foreground/60">· one per line · max 10</span></label>
              <textarea
                value={sessionUrls}
                onChange={(e) => setSessionUrls(e.target.value)}
                rows={4}
                placeholder={"https://youtube.com/watch?v=…\nhttps://youtube.com/watch?v=…"}
                className="w-full rounded-lg border border-input bg-muted text-foreground placeholder:text-muted-foreground px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring/50 resize-none"
              />
              <p className="text-xs text-muted-foreground">The AI scans the full recording and extracts every match for {opponentName}.</p>
            </div>
            <AppearanceFields
              format={format} setFormat={setFormat}
              appearanceColor={appearanceColor} setAppearanceColor={setAppearanceColor}
              startingSide={startingSide} setStartingSide={setStartingSide}
              notes={notes} setNotes={setNotes}
            />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <DialogClose><Button variant="outline" type="button">Cancel</Button></DialogClose>
          {method === 'single' && (
            <Button
              onClick={singleMode === 'url' ? submitSingleUrl : submitSingleUpload}
              disabled={pending}
            >
              {pending ? (singleMode === 'upload' ? 'Uploading…' : 'Submitting…') : 'Submit'}
            </Button>
          )}
          {method === 'session' && (
            <Button onClick={submitSession} disabled={pending}>
              {pending ? 'Submitting…' : 'Submit'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
