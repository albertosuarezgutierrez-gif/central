'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'

/**
 * «Descartar (ya no lo tiene)» en una oportunidad derivada del volcado (30/09/2026). Las filas del
 * volcado no se escriben en la tabla de oportunidades, y esta es la única acción que lo hace: el
 * puerto no admite crear una oportunidad ya `perdida` (nace «por contactar» y con primer paso), así
 * que son dos llamadas al POST de siempre: crear con la matrícula/nº de ese riesgo y perderla con
 * «ya no lo necesita». Con una perdida de ese riesgo, la derivada deja de pintarse.
 */
async function enviar(body: Record<string, unknown>): Promise<{ ok: boolean; motivo: string; id: string | null }> {
  try {
    const r = await fetch('/api/correduria/oportunidad', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string; id?: string } | null
    return { ok: r.ok && j?.estado === 'ok', motivo: j?.motivo ?? `HTTP ${r.status}`, id: typeof j?.id === 'string' ? j.id : null }
  } catch {
    return { ok: false, motivo: 'sin conexión', id: null }
  }
}

export default function DescartarVolcado(p: {
  clienteId: string; ramo: string; aseguradora: string | null; numeroPoliza: string | null; matricula: string | null; vehiculo: string | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmar() {
    setOcupado(true); setError(null)
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    const alta = await enviar({
      accion: 'crear', clienteId: p.clienteId, ramo: p.ramo, estado: 'competencia',
      aseguradora: p.aseguradora, numeroPoliza: p.numeroPoliza, matricula: p.matricula, vehiculo: p.vehiculo,
      tipoTarea: 'llamada', fechaTarea: hoy, nota: 'Descartada desde el volcado: ya no lo tiene.',
    })
    if (!alta.ok || alta.id === null) {
      setOcupado(false)
      setError(`No se ha descartado: ${alta.motivo}`)
      return
    }
    const perdida = await enviar({ id: alta.id, accion: 'perder', motivo: 'cliente_desiste', detalle: 'Ya no lo tiene (descartada desde el volcado).' })
    setOcupado(false)
    if (!perdida.ok) {
      setError(`Se abrió su oportunidad pero no se ha podido cerrar (${perdida.motivo}). Ábrela en la pestaña Oportunidades y márcala perdida.`)
      router.refresh()
      return
    }
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, color: 'var(--negative)' }}>
        Descartar (ya no lo tiene)
      </button>
    )
  }
  return (
    <div role="group" aria-label="Confirmar descarte" style={{ display: 'grid', gap: 6, flex: '1 1 100%', fontSize: 12 }}>
      <span>¿Ya no tiene este seguro? Sale de Oportunidades; queda anotado como «ya no lo necesita».</span>
      {error && <span role="alert" style={{ color: 'var(--negative)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={ocupado} onClick={() => void confirmar()} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
          {ocupado ? 'Descartando…' : 'Sí, descartar'}
        </button>
        <button type="button" disabled={ocupado} onClick={() => { setAbierto(false); setError(null) }} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
      </div>
    </div>
  )
}
