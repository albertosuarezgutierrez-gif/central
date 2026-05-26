'use client'
import { useEffect } from 'react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { console.error('[ia.rest error]', error) }, [error])

  return (
    <div style={{
      minHeight: '100vh', background: '#14110E', color: '#F6F1E7',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, fontFamily: 'Inter Tight, sans-serif',
      padding: 24,
    }}>
      <div style={{ fontSize: 40 }}>⚡</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>Algo ha fallado</div>
      <div style={{ fontSize: 13, color: '#9C8E7E', maxWidth: 320, textAlign: 'center' }}>
        Ha ocurrido un error inesperado. Pulsa para recargar o vuelve a intentarlo.
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8, padding: '10px 24px', borderRadius: 8,
          background: '#D9442B', color: '#fff', border: 'none',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Reintentar
      </button>
      {process.env.NODE_ENV === 'development' && (
        <pre style={{ fontSize: 11, color: '#6B5F52', maxWidth: 500, overflow: 'auto' }}>
          {error.message}
        </pre>
      )}
    </div>
  )
}
