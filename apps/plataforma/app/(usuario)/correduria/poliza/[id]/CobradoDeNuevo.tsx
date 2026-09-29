'use client'

// Recibo que la compañía avisó POR CORREO que el banco devolvió: cuando el cliente ya ha pagado (o la
// compañía lo ha vuelto a cobrar) y CIMA no lo va a contar, se marca aquí. Cierra la llamada y la
// oportunidad del recibo. Pide confirmación: deja de perseguir un impago.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { btnStyle } from '@/components/ui'

export default function CobradoDeNuevo({ reciboId }: { reciboId: string }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function marcar() {
    if (!window.confirm('¿Marcar este recibo como COBRADO de nuevo? Se cierran su llamada y su seguimiento.')) return
    setEnviando(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/recibo-devolucion', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reciboId }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (j?.estado === 'ok') router.refresh()
      else setError(j?.motivo ?? `No se ha podido marcar (HTTP ${r.status}).`)
    } catch {
      setError('No se ha podido llegar al servidor: no sé si se ha marcado. Recarga antes de repetir.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" onClick={marcar} disabled={enviando} style={btnStyle('secundario')}>
        {enviando ? 'Marcando…' : '✓ Cobrado de nuevo'}
      </button>
      {error && <div role="alert" style={{ color: 'var(--negative)', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  )
}
