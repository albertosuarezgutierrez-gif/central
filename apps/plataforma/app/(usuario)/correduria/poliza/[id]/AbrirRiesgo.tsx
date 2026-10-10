'use client'

// «Abrir el riesgo de esta póliza» (29/09/2026): renovación/retención con el mismo modelo que un
// presupuesto nuevo. Abre (o reutiliza la abierta) la oportunidad de retarificar ESTA póliza, con las
// personas que ya tiene, y lleva a su pantalla del riesgo. Gratis: no pide precio.

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'

export default function AbrirRiesgo({ polizaId }: { polizaId: string }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function abrir() {
    setOcupado(true)
    setError(null)
    try {
      const res = await fetch('/api/correduria/oportunidad/de-poliza', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaId }),
      })
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
      const id = res.ok && j?.estado === 'ok' && typeof j.oportunidadId === 'string' ? j.oportunidadId : null
      if (!id) {
        const motivo = typeof j?.motivo === 'string' ? j.motivo : typeof j?.causa === 'string' ? j.causa : `HTTP ${res.status}`
        setError(`No se ha podido abrir el riesgo: ${motivo}.`)
        setOcupado(false)
        return
      }
      router.push(`/correduria/oportunidad/${encodeURIComponent(id)}`)
    } catch {
      setError('No se ha podido hablar con el servidor. No se sabe si se ha abierto: recarga antes de repetir.')
      setOcupado(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button type="button" disabled={ocupado} onClick={() => void abrir()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
        {ocupado ? 'Abriendo…' : 'Abrir el riesgo de esta póliza'}
      </button>
      {error && <span role="alert" style={{ fontSize: 12, color: 'var(--negative)' }}>{error}</span>}
    </span>
  )
}
