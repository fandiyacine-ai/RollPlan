'use client'

import { useState } from 'react'

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? ''
const ANNUAL_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL ?? ''

const FEATURES = [
  'Unlimited video analysis',
  'Unlimited opponent scouting',
  'Unlimited tournaments',
  'Everything in Free, no monthly cap',
  '14-day free trial — cancel anytime',
]

export function UpgradeOffer() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual')
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const priceId = billing === 'annual' ? ANNUAL_PRICE_ID : MONTHLY_PRICE_ID
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
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
        <h1 className="text-2xl font-bold leading-tight">Train smarter. Win more.</h1>
        <p className="text-sm text-muted-foreground">14-day free trial, then cancel anytime.</p>
      </div>

      {/* Billing toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
        <button
          onClick={() => setBilling('monthly')}
          className={`flex-1 py-2 transition-colors ${billing === 'monthly' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Monthly — €5
        </button>
        <button
          onClick={() => setBilling('annual')}
          className={`flex-1 py-2 transition-colors relative ${billing === 'annual' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Annual — €50
          <span className={`ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded ${billing === 'annual' ? 'bg-background/20 text-background' : 'bg-emerald-500/20 text-emerald-400'}`}>
            -17%
          </span>
        </button>
      </div>

      {/* Feature list */}
      <ul className="space-y-2.5">
        {FEATURES.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 mt-0.5 flex-shrink-0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        onClick={handleUpgrade}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Redirecting…' : `Start free trial — ${billing === 'annual' ? '€50/year' : '€5/month'}`}
      </button>

      <p className="text-[10px] text-center text-muted-foreground/50">
        Secure checkout via Stripe · No charge during trial
      </p>
    </>
  )
}
