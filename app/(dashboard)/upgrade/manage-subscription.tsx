'use client'

import { useState } from 'react'

export function ManageSubscription({ tier }: { tier: 'pro' | 'trial' }) {
  const [loading, setLoading] = useState(false)

  async function handleManage() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error ?? 'Something went wrong')
        setLoading(false)
      }
    } catch {
      alert('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">RollPlan Pro</p>
        <h1 className="text-2xl font-bold leading-tight">
          {tier === 'trial' ? "You're on your free trial" : "You're on Pro"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tier === 'trial'
            ? 'Enjoy unlimited tournaments, full AI gameplans, and Ask AI during your trial.'
            : 'Thanks for being a Pro member — unlimited tournaments, full AI gameplans, and Ask AI are all yours.'}
        </p>
      </div>

      <button
        onClick={handleManage}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Opening billing portal…' : 'Manage subscription'}
      </button>

      <p className="text-[10px] text-center text-muted-foreground/50">
        Update payment details, change plans, or cancel — handled securely via Stripe
      </p>
    </>
  )
}
