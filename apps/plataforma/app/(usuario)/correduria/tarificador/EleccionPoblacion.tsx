'use client'

// Elegir la población de un CP con varias (19/10/2026). El bot paró (`requiere_humano`) porque no puede adivinar cuál; la
// lista exacta viene de asegura (`opcionesPoblacion`). Solo se elige entre ellas (sin texto libre). Un solo clic: el botón
// se deshabilita mientras envía. Reintentar solo vuelve a pedir el precio; nunca contrata.

import { useRef, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { cuerpoEleccionPoblacion } from '@/lib/tarificador-bandeja'
import type { OpcionPoblacion } from '@central/module-tarificacion'

export default function EleccionPoblacion({ trabajoId, opciones, deshabilitado, alTerminar }: {
  trabajoId: string
  opciones: OpcionPoblacion[]
  deshabilitado: boolean
  alTerminar: (aviso: string) => void | Promise<void>
}) {
  const [indice, setIndice] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enCurso = useRef(false)
  const elegida = cuerpoEleccionPoblacion(opciones, indice)

  async function reintentar() {
    if (elegida === null || enCurso.current) return
    enCurso.current = true
    setEnviando(true); setError(null)
    try {
      const res = await fetch(`/api/correduria/tarificador/bandeja/${encodeURIComponent(trabajoId)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'reintentar', eleccionPoblacion: elegida }),
      })
      if (res.status === 200 || res.status === 202) {
        await alTerminar('Vuelve a la cola con la población elegida: el bot lo intentará de nuevo.')
        return
      }
      const j = (await res.json().catch(() => null)) as { motivo?: string; mensaje?: string } | null
      const causa = j?.motivo ?? j?.mensaje
      setError(`No se pudo reintentar con esa población (HTTP ${res.status})${causa ? `: ${causa}` : ''}.`)
    } catch {
      setError('No se pudo reintentar con esa población (sin respuesta de red).')
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="Población del código postal" value={indice} onChange={(e) => setIndice(e.target.value)} disabled={enviando || deshabilitado}
          style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 8px', minWidth: 0, maxWidth: '100%', flex: '1 1 220px' }}>
          <option value="">Elige la población…</option>
          {opciones.map((o, i) => <option key={o.codigo} value={String(i)}>{o.codigo}</option>)}
        </select>
        <button type="button" onClick={() => void reintentar()} disabled={enviando || deshabilitado || elegida === null}
          style={{ ...btnStyle('primario'), minHeight: 44, opacity: enviando || deshabilitado || elegida === null ? 0.6 : 1 }}>
          {enviando ? 'Un momento…' : 'Reintentar con esta población'}
        </button>
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</p>}
    </div>
  )
}
