'use client'

import { useState, useTransition } from 'react'
import { setOpenToConnectionsAction } from './actions'

export function ConnectionsToggle({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const next = !open
    setOpen(next)
    startTransition(async () => {
      const result = await setOpenToConnectionsAction(next)
      if (result.error) setOpen(!next)
    })
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Connections</h2>
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Let competitors I've faced connect with me</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              When this is on, people you've competed against can send you a connection request after the event — and you'll only actually connect if you both want to.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={open}
            onClick={toggle}
            disabled={pending}
            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${open ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${open ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <div className="mt-3 space-y-1 text-xs">
          <p className="text-muted-foreground">
            <span className="text-rose-500 font-semibold">✗</span>{' '}
            Your gameplans, scouted match footage, and AI analysis stay completely private. Connections never see your prep work — before or after connecting. Only you do.
          </p>
          <p className="text-muted-foreground">
            <span className="text-emerald-500 font-semibold">✓</span>{' '}
            Connections can see your upcoming tournaments and public competition record — the same info already on your player card.
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground/70 italic mt-3">
          RollPlan is built so you can scout with total privacy and connect with total confidence — at the same time.
        </p>
      </div>
    </section>
  )
}
