'use client'
import { useState } from 'react'

/** El gesto explícito de aceptar el enlace. Gasta el enlace (un uso) y lleva al contrato. */
export function AceptarEnlace({ token }: { token: string }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aceptar() {
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/inquilino/canjear', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const j = (await r.json().catch(() => null)) as { contratoId?: unknown; error?: unknown } | null
      if (r.ok && typeof j?.contratoId === 'string') {
        window.location.assign(`/mi-alquiler/${j.contratoId}`)
        return
      }
      setError(
        r.status === 404
          ? 'Este enlace ya no vale. Pide a tu propietario uno nuevo.'
          : r.status === 429
            ? 'Demasiados intentos. Espera un rato y vuelve a probar.'
            : 'No hemos podido abrirlo. Inténtalo otra vez dentro de un momento.',
      )
    } catch {
      setError('No hemos podido abrirlo: comprueba tu conexión e inténtalo otra vez.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={aceptar} disabled={enviando} style={{ minHeight: 44 }}>
        {enviando ? 'Abriendo…' : 'Ver mi contrato'}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--error, #b00020)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
