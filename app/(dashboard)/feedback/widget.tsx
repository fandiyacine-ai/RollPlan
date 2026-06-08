'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { submitFeedbackAction } from './actions'

type Category = 'bug' | 'feature' | 'praise' | 'other'

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'praise', label: 'Loving it' },
  { value: 'other', label: 'Other' },
]

const LS_KEY = 'rp_feedback_dismissed'
const AUTO_PROMPT_DELAY_MS = 3 * 60 * 1000 // 3 minutes after first load

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="text-2xl leading-none transition-transform hover:scale-110 focus:outline-none"
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
        >
          <span className={(hovered || value) >= n ? 'text-amber-400' : 'text-muted-foreground/30'}>★</span>
        </button>
      ))}
    </div>
  )
}

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const [rating, setRating] = useState(0)
  const [category, setCategory] = useState<Category | ''>('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle')
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!rating && !message.trim()) return
    setStatus('submitting')
    await submitFeedbackAction({ rating: rating || undefined, category: category || undefined, message, page: pathname })
    setStatus('done')
    // Store so we don't auto-prompt again for a week
    try { localStorage.setItem(LS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)) } catch {}
    setTimeout(onClose, 1800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-sm z-10">
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <h2 className="font-semibold text-sm">Share your feedback</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {status === 'done' ? (
          <div className="px-5 py-8 text-center space-y-2">
            <div className="text-3xl">🙏</div>
            <p className="font-medium text-sm">Thanks — we read every message.</p>
            <p className="text-xs text-muted-foreground">Your feedback is helping shape RollPlan.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 pb-5 pt-3 space-y-4">
            {/* Star rating */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">How are you finding RollPlan?</p>
              <StarRating value={rating} onChange={setRating} />
            </div>

            {/* Category chips */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(category === c.value ? '' : c.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    category === c.value
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              ref={textRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us more… (optional)"
              rows={3}
              className="w-full text-sm resize-none rounded-xl border border-border bg-muted/40 px-3 py-2.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <button
              type="submit"
              disabled={status === 'submitting' || (!rating && !message.trim())}
              className="w-full text-sm font-semibold py-2.5 rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {status === 'submitting' ? 'Sending…' : 'Send feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [autoPrompted, setAutoPrompted] = useState(false)

  useEffect(() => {
    // Auto-prompt once after 3 min if the user hasn't dismissed in the last week
    let timer: ReturnType<typeof setTimeout>
    try {
      const until = parseInt(localStorage.getItem(LS_KEY) ?? '0', 10)
      if (Date.now() < until) return
    } catch {}
    timer = setTimeout(() => {
      setOpen(true)
      setAutoPrompted(true)
    }, AUTO_PROMPT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  function handleClose() {
    setOpen(false)
    // If this was an auto-prompt dismissal (no submission), snooze for 3 days
    if (autoPrompted) {
      try { localStorage.setItem(LS_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000)) } catch {}
    }
    setAutoPrompted(false)
  }

  return (
    <>
      {/* Floating trigger button — icon-only FAB on mobile (small footprint, tucked above the
          tab bar so it overlaps as little scrollable card content as possible), full label on desktop */}
      <button
        onClick={() => setOpen(true)}
        className="fixed z-40 flex items-center justify-center gap-1.5 text-xs font-medium rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-sm hover:bg-muted transition-colors bottom-[4.75rem] right-3 w-10 h-10 p-0 sm:bottom-6 sm:right-6 sm:w-auto sm:h-auto sm:px-3 sm:py-2"
        aria-label="Give feedback"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && <FeedbackModal onClose={handleClose} />}
    </>
  )
}
