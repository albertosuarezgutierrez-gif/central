'use client'
// Registra el clic de un lead que llega desde un email frío del CRM
// (landings /, /catering, /espacios). Dispara el aviso a Telegram en el backend.
import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function Inner() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const utm_id = searchParams.get('utm_id')
    const utm_source = searchParams.get('utm_source') || ''
    const tk = searchParams.get('tk')

    // Cualquier vertical del CRM: crm_lead, crm_catering, crm_eventos…
    if (utm_id && tk && utm_source.startsWith('crm_')) {
      fetch('/api/leads/track-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: utm_id, token: tk, source: utm_source }),
      }).catch(() => {})
    }
  }, [searchParams])

  return null
}

export default function LandingClickTracker() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
