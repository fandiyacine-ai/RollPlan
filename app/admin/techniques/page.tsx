'use client'

import { useEffect, useState, useCallback } from 'react'

type Variant = {
  id: string
  eventId: string
  positionId: string | null
  name: string
  format: string
  visualCues: string
  counters: string | null
  referenceImageUrl: string | null
  sourceUrl: string | null
  sourceLabel: string | null
  extractedByModel: string | null
  status: string
  adminNotes: string | null
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
}

export default function AdminTechniquesPage() {
  const [variants, setVariants] = useState<Variant[]>([])
  const [loading, setLoading] = useState(true)
  const [ingestUrl, setIngestUrl] = useState('')
  const [ingestHint, setIngestHint] = useState('')
  const [ingestPosition, setIngestPosition] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Variant>>({})
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'draft' | 'active' | 'rejected'>('draft')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/techniques')
    const data = await res.json()
    setVariants(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const ingest = async () => {
    if (!ingestUrl.trim()) return
    setIngesting(true)
    setIngestMsg('')
    try {
      const res = await fetch('/api/admin/techniques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl: ingestUrl.trim(), techniqueHint: ingestHint.trim() || undefined, positionHint: ingestPosition.trim() || undefined }),
      })
      if (res.ok) {
        setIngestMsg('✓ Queued — Inngest will process the video and create a draft. Refresh in 1–2 minutes.')
        setIngestUrl('')
        setIngestHint('')
        setIngestPosition('')
      } else {
        setIngestMsg('✗ Failed to queue')
      }
    } finally {
      setIngesting(false)
    }
  }

  const patch = async (id: string, updates: Partial<Variant>) => {
    setSaving(true)
    await fetch('/api/admin/techniques', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    await load()
    setSaving(false)
    setEditing(null)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this variant permanently?')) return
    await fetch(`/api/admin/techniques?id=${id}`, { method: 'DELETE' })
    await load()
  }

  const startEdit = (v: Variant) => {
    setEditing(v.id)
    setEditDraft({ name: v.name, eventId: v.eventId, positionId: v.positionId ?? '', format: v.format, visualCues: v.visualCues, counters: v.counters ?? '', adminNotes: v.adminNotes ?? '' })
  }

  const filtered = variants.filter(v => filter === 'all' || v.status === filter)
  const counts = { all: variants.length, draft: variants.filter(v => v.status === 'draft').length, active: variants.filter(v => v.status === 'active').length, rejected: variants.filter(v => v.status === 'rejected').length }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Technique Knowledge Base</h1>
        <p className="text-sm text-zinc-400 mt-1">Manage BJJ technique variants that power match analysis, AI chat, and gameplan generation.</p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4 text-sm">
        <p className="font-semibold text-zinc-200">How it works</p>
        <ol className="list-decimal list-inside space-y-2 text-zinc-400">
          <li><span className="text-zinc-200">Paste a YouTube URL</span> of an instructional video (2–10 min, narrated, clear camera angle). Good sources: Danaher series, Bernardo Faria, Craig Jones, Kit Dale.</li>
          <li>Add a hint like <span className="font-mono text-zinc-300">"armbar from mount"</span> and the starting position <span className="font-mono text-zinc-300">"mount"</span>. This helps Gemini focus on the right technique if the video covers multiple.</li>
          <li>Click <span className="text-zinc-200">Extract from video</span>. Gemini will watch the video, listen to the coach's narration, and generate a visual detection description (1–2 min).</li>
          <li>A <span className="text-amber-400">draft</span> record appears below. Review it — check that visual_cues accurately describe what to look for in a competition video. Edit if needed.</li>
          <li>Click <span className="text-emerald-400">Approve</span> to set status to <span className="text-emerald-400">active</span>. Active records are automatically injected into every new match analysis, coach chat, and gameplan for the relevant format.</li>
        </ol>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-1 text-xs text-zinc-400">
          <p className="font-semibold text-zinc-300">What to look for when reviewing visual_cues:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Is the description specific enough? "isolates the arm" is too vague. "Pulls the arm across their centreline, securing the elbow with their hip" is good.</li>
            <li>Does it describe what the SETUP looks like — not just the finish? The AI needs to detect attempts, not just taps.</li>
            <li>Does it describe the FROM position correctly? Armbar from mount vs from guard are completely different movements.</li>
            <li>Is the counters field useful? It should say what to do defensively — "bridge before elbow crosses centre" not "defend the armbar".</li>
          </ul>
        </div>
      </div>

      {/* Ingest form */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <p className="font-semibold text-zinc-200">Extract from YouTube instructional</p>
        <div className="space-y-3">
          <input
            value={ingestUrl}
            onChange={e => setIngestUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
          />
          <div className="flex gap-3">
            <input
              value={ingestHint}
              onChange={e => setIngestHint(e.target.value)}
              placeholder="Technique hint — e.g. armbar from mount"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
            <input
              value={ingestPosition}
              onChange={e => setIngestPosition(e.target.value)}
              placeholder="From position — e.g. mount"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={ingest}
              disabled={ingesting || !ingestUrl.trim()}
              className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-white transition-colors"
            >
              {ingesting ? 'Queuing…' : 'Extract from video'}
            </button>
            {ingestMsg && <p className="text-xs text-zinc-400">{ingestMsg}</p>}
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(['draft', 'active', 'rejected', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors relative ${filter === f ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {f} {counts[f] > 0 && <span className="text-xs text-zinc-500">({counts[f]})</span>}
            {filter === f && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-100" />}
          </button>
        ))}
      </div>

      {/* Variant list */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {filter === 'draft' ? 'No drafts yet — extract from a YouTube video above.' : `No ${filter} variants.`}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(v => (
            <div key={v.id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              {/* Card header */}
              <div className="flex items-start justify-between p-4 pb-3 gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-100">{v.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${STATUS_COLORS[v.status] ?? ''}`}>{v.status}</span>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{v.eventId}{v.positionId ? ` / ${v.positionId}` : ''}</span>
                    <span className="text-[10px] text-zinc-500">{v.format}</span>
                  </div>
                  {v.sourceUrl && (
                    <a href={v.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:text-zinc-300 truncate block">
                      {v.sourceLabel ?? v.sourceUrl}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {v.status === 'draft' && (
                    <>
                      <button onClick={() => patch(v.id, { status: 'active' })} className="text-xs px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 rounded-lg hover:bg-emerald-500/25 transition-colors">Approve</button>
                      <button onClick={() => patch(v.id, { status: 'rejected' })} className="text-xs px-3 py-1.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-colors">Reject</button>
                    </>
                  )}
                  {v.status === 'active' && (
                    <button onClick={() => patch(v.id, { status: 'rejected' })} className="text-xs px-3 py-1.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors">Deactivate</button>
                  )}
                  {v.status === 'rejected' && (
                    <button onClick={() => patch(v.id, { status: 'draft' })} className="text-xs px-3 py-1.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors">Restore to draft</button>
                  )}
                  <button onClick={() => startEdit(v)} className="text-xs px-3 py-1.5 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors">Edit</button>
                  <button onClick={() => remove(v.id)} className="text-xs px-2 py-1.5 text-zinc-600 hover:text-rose-400 transition-colors">✕</button>
                </div>
              </div>

              {/* Inline editor */}
              {editing === v.id ? (
                <div className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-800/30">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Name</label>
                      <input value={editDraft.name ?? ''} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Event ID</label>
                      <input value={editDraft.eventId ?? ''} onChange={e => setEditDraft(d => ({ ...d, eventId: e.target.value }))} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Position ID (from)</label>
                      <input value={editDraft.positionId ?? ''} onChange={e => setEditDraft(d => ({ ...d, positionId: e.target.value }))} placeholder="mount, closed_guard…" className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Visual Cues <span className="normal-case text-zinc-600">— what Gemini should look for in competition footage</span></label>
                    <textarea value={editDraft.visualCues ?? ''} onChange={e => setEditDraft(d => ({ ...d, visualCues: e.target.value }))} rows={6} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none resize-y" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Counters <span className="normal-case text-zinc-600">— what to do on the receiving end</span></label>
                    <textarea value={editDraft.counters ?? ''} onChange={e => setEditDraft(d => ({ ...d, counters: e.target.value }))} rows={3} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none resize-y" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Admin notes</label>
                    <input value={editDraft.adminNotes ?? ''} onChange={e => setEditDraft(d => ({ ...d, adminNotes: e.target.value }))} className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm focus:outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => patch(v.id, editDraft)} disabled={saving} className="px-3 py-1.5 bg-zinc-100 text-zinc-900 rounded-lg text-xs font-semibold disabled:opacity-40">Save</button>
                    <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                /* Read-only view */
                <div className="border-t border-zinc-800 p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Visual Cues</p>
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{v.visualCues}</p>
                  </div>
                  {v.counters && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Counters</p>
                      <p className="text-sm text-zinc-400 leading-relaxed">{v.counters}</p>
                    </div>
                  )}
                  {v.adminNotes && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Notes</p>
                      <p className="text-xs text-zinc-500">{v.adminNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
