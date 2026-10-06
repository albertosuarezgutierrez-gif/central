'use client'

// «Pedir presupuesto» (07/10/2026). Decisión de Alberto: la cotización por bots ya NO se lanza desde la ficha
// (antes, botón «Precio Allianz (bot)»), sino desde OPORTUNIDADES. Este botón abre la oportunidad del ramo
// (la crea si no hay una abierta; si ya la hay, asegura devuelve la existente) y lleva a su sección
// «Presupuestos de compañías», donde está el formulario común. Aquí no se cotiza nada.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Bot } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { rotuloRamo } from '@/lib/seguimiento-asegura'
import { idOportunidadCreada, ramosConBot } from '@/lib/presupuestos-companias'

export default function PedirPresupuestoBot({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const ramos = ramosConBot()
  const [ramo, setRamo] = useState(ramos[0] ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (ramos.length === 0) return null

  async function abrir() {
    if (ocupado || !ramo) return
    setOcupado(true); setError(null)
    try {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
      const r = await fetch('/api/correduria/oportunidad', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accion: 'crear', clienteId, ramo, estado: 'en_negociacion', tipoTarea: 'tarea', fechaTarea: hoy, nota: 'Pedir presupuesto a las compañías (bots)' }),
      })
      const j = await r.json().catch(() => null)
      const id = idOportunidadCreada(r.status, j)
      if (!id) {
        const motivo = j && typeof j === 'object' && typeof (j as Record<string, unknown>).motivo === 'string' ? (j as Record<string, string>).motivo : `HTTP ${r.status}`
        setError(`No se ha podido abrir la oportunidad: ${motivo}`)
        setOcupado(false)
        return
      }
      router.push(`/correduria/oportunidad/${encodeURIComponent(id)}#presupuestos`)
    } catch {
      setError('No se ha podido contactar con plataforma: vuelve a intentarlo.')
      setOcupado(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
      {ramos.length > 1 && (
        <select aria-label="Ramo del presupuesto" value={ramo} onChange={(e) => setRamo(e.target.value)}
          style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 8px' }}>
          {ramos.map((r) => <option key={r} value={r}>{rotuloRamo(r)}</option>)}
        </select>
      )}
      <button type="button" onClick={() => void abrir()} disabled={ocupado} style={{ ...btnStyle('secundario'), opacity: ocupado ? 0.6 : 1 }}
        title={`Abre la oportunidad de ${rotuloRamo(ramo).toLowerCase()} de este cliente con el formulario para pedir presupuesto a las compañías.`}>
        <Bot size={16} aria-hidden /> {ocupado ? 'Abriendo…' : `Pedir presupuesto${ramos.length === 1 ? ` (${rotuloRamo(ramo).toLowerCase()})` : ''}`}
      </button>
      {error && <span role="alert" style={{ fontSize: 12, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</span>}
    </span>
  )
}
