'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function SignupConversion() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('signup') !== '1') return

    window.gtag?.('event', 'conversion', {
      send_to: 'AW-18229553848/23o0CK38q70cELjVw_RD',
    })

    const params = new URLSearchParams(searchParams)
    params.delete('signup')
    const qs = params.toString()
    router.replace(qs ? `/player-card?${qs}` : '/player-card', { scroll: false })
  }, [searchParams, router])

  return null
}
