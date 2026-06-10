'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

export function UpgradeConversion() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('upgraded') !== '1') return

    window.gtag?.('event', 'conversion', {
      send_to: 'AW-18229553848/7JhvCPuSxrwcELjVw_RD',
      value: Number(searchParams.get('value') ?? '0'),
      currency: 'EUR',
      transaction_id: searchParams.get('session_id') ?? '',
    })

    const params = new URLSearchParams(searchParams)
    params.delete('upgraded')
    params.delete('value')
    params.delete('session_id')
    const qs = params.toString()
    router.replace(qs ? `/player-card?${qs}` : '/player-card', { scroll: false })
  }, [searchParams, router])

  return null
}
