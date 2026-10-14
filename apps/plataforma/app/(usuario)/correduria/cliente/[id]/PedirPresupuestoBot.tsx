'use client'

// «Pedir presupuesto» (07/10/2026). Decisión de Alberto: la cotización por bots ya NO se lanza desde la ficha
// (antes, botón «Precio Allianz (bot)»), sino desde OPORTUNIDADES. Este botón abre la oportunidad del ramo
// (la crea si no hay una abierta; si ya la hay, asegura devuelve la existente) y lleva a su sección
// «Presupuestos de compañías», donde está el formulario común. Aquí no se cotiza nada.
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { rotuloRamo } from '@/lib/seguimiento-asegura'
import { idOportunidadCreada, ramosConBot } from '@/lib/presupuestos-companias'

/** Abre (o recupera) la oportunidad del ramo en negociación con su tarea y devuelve su id; el salto a `#presupuestos` lo hace quien llama. */
export async function abrirOportunidadBot(clienteId: string, ramo: string): Promise<{ ok: true; id: string } | { ok: false; mensaje: string }> {
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
      return { ok: false, mensaje: `No se ha podido abrir la oportunidad: ${motivo}` }
    }
    return { ok: true, id }
  } catch {
    return { ok: false, mensaje: 'No se ha podido contactar con plataforma: vuelve a intentarlo.' }
  }
}

/** Entradas del menú «Nueva oportunidad» (grupo «Con precio»): una por ramo con bot, p. ej. «Comunidades · bots». */
export default function PedirPresupuestoBot({ clienteId }: { clienteId: string }) {
  const router = useRouter()
  const ramos = ramosConBot()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (ramos.length === 0) return null

  async function abrir(ramo: string) {
    if (ocupado) return
    setOcupado(ramo); setError(null)
    const r = await abrirOportunidadBot(clienteId, ramo)
    if (!r.ok) { setError(r.mensaje); setOcupado(null); return }
    router.push(`/correduria/oportunidad/${encodeURIComponent(r.id)}#presupuestos`)
  }

  return (
    <>
      {ramos.map((ramo) => (
        <button key={ramo} type="button" role="menuitem" onClick={() => void abrir(ramo)} disabled={ocupado !== null}
          title={`Abre la oportunidad de ${rotuloRamo(ramo).toLowerCase()} de este cliente con el formulario para pedir presupuesto a las compañías (bots).`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)', background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer', opacity: ocupado ? 0.6 : 1 }}>
          {ocupado === ramo ? 'Abriendo…' : `${rotuloRamo(ramo)} · bots`}
        </button>
      ))}
      {error && <p role="alert" style={{ margin: '2px 6px', fontSize: 12, color: 'var(--negative)', overflowWrap: 'anywhere' }}>{error}</p>}
    </>
  )
}
