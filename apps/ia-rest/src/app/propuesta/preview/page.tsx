// Propuesta dinámica generada por Lead Hunter IA
'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import PropuestaBase, { ClienteConfig } from '@/components/propuesta/PropuestaBase'
import { C } from '@/lib/colors'

function PreviewContent() {
  const params = useSearchParams()
  const raw = params.get('d')

  if (!raw) {
    return (
      <div style={{ background: C.dark, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink3, fontFamily: 'sans-serif' }}>
        Propuesta no encontrada
      </div>
    )
  }

  let config: ClienteConfig
  try {
    config = JSON.parse(atob(decodeURIComponent(raw)))
  } catch {
    return (
      <div style={{ background: C.dark, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink3, fontFamily: 'sans-serif' }}>
        Error al cargar la propuesta
      </div>
    )
  }

  return <PropuestaBase config={config} />
}

export default function PropuestaPreviewPage() {
  return (
    <Suspense fallback={
      <div style={{ background: C.dark, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink3, fontFamily: 'sans-serif' }}>
        Cargando propuesta…
      </div>
    }>
      <PreviewContent />
    </Suspense>
  )
}
