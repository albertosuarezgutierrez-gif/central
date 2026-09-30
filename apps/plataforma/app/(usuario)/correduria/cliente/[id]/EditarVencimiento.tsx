'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { planTareaTrasVencimiento } from '@central/module-seguros'
import { btnStyle } from '@/components/ui'
import { AvisoFechaDudosa } from './piezas'

/**
 * Corregir el vencimiento desde la tarjeta de Oportunidades (29/09/2026): es la fecha con la que
 * se llama a la clienta, y el escaneo o el volcado la traen mal a veces. Se guarda en el
 * SEGUIMIENTO (`fecha_fin_vigencia`), que es de donde sale el aviso; la póliza del volcado no se
 * toca (su fecha es un dato histórico). Si la póliza aún no tiene seguimiento, se abre el suyo
 * (gratis, el mismo de «Abrir riesgo» de la póliza) y se le pone la fecha.
 * Con la fecha va su llamada (30/09/2026): si no tiene, se programa 45 días antes; si la tenía
 * puesta con la fecha mala, se mueve. Se enseña antes de guardar y se puede desmarcar.
 */
type Resp = { ok: boolean; status: number; json: { estado?: string; motivo?: string; oportunidadId?: string } | null }

async function post(url: string, body: Record<string, unknown>): Promise<Resp> {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await r.json().catch(() => null)) as Resp['json']
  return { ok: r.ok && json?.estado === 'ok', status: r.status, json }
}

const motivo = (r: Resp) => r.json?.motivo ?? `HTTP ${r.status}`
const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export default function EditarVencimiento(props: { vence: string | null; proximaLlamada: string | null } & ({ oportunidadId: string } | { polizaId: string })) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [fecha, setFecha] = useState(props.vence ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reprogramar, setReprogramar] = useState(true)
  const sinSeguimiento = !('oportunidadId' in props)
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  // El mismo plan que aplica asegura al guardar, para decirlo antes y no después. Asegura solo
  // reprograma si la fecha CAMBIA; sin seguimiento no había ninguna, así que cualquiera cambia.
  const plan = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && (sinSeguimiento || fecha !== props.vence)
    ? planTareaTrasVencimiento(fecha, props.proximaLlamada ? { id: '', fecha: props.proximaLlamada } : null, hoy)
    : null
  const textoPlan = plan?.accion === 'crear' ? `Programar su llamada el ${fmt(plan.fecha)} (45 días antes)`
    : plan?.accion === 'mover' ? `Mover su llamada del ${fmt(plan.desde)} al ${fmt(plan.fecha)} (45 días antes)`
      : null

  async function guardar() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError('Pon una fecha.')
    setOcupado(true); setError(null)
    try {
      let id = 'oportunidadId' in props ? props.oportunidadId : null
      if (id === null && 'polizaId' in props) {
        const r = await post('/api/correduria/oportunidad/de-poliza', { polizaId: props.polizaId })
        if (!r.ok || !r.json?.oportunidadId) return setError(`No se ha guardado: ${motivo(r)}`)
        id = r.json.oportunidadId
      }
      const r = await post('/api/correduria/oportunidad', { accion: 'editar', id, fechaFinVigencia: fecha, reprogramar: textoPlan !== null && reprogramar })
      if (!r.ok) return setError(sinSeguimiento ? `Se abrió su seguimiento, pero la fecha no se ha guardado: ${motivo(r)}` : `No se ha guardado: ${motivo(r)}`)
      setAbierto(false)
      router.refresh()
    } catch {
      setError('Sin conexión: no se sabe si se guardó. Recarga antes de repetirlo.')
    } finally {
      setOcupado(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => { setFecha(props.vence ?? ''); setError(null); setAbierto(true) }} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
        {props.vence ? 'Cambiar vencimiento' : 'Poner vencimiento'}
      </button>
    )
  }
  return (
    <div role="group" aria-label="Fecha de vencimiento" style={{ display: 'grid', gap: 8, flexBasis: '100%', fontSize: 13 }}>
      <label style={{ display: 'grid', gap: 4, color: 'var(--muted)' }}>Le vence
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} autoFocus
          style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }} />
      </label>
      {sinSeguimiento && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Se abre su seguimiento de venta: el aviso para llamarla sale de esta fecha.</span>}
      {textoPlan && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, color: 'var(--text)' }}>
          <input type="checkbox" checked={reprogramar} onChange={e => setReprogramar(e.target.checked)} style={{ width: 20, height: 20 }} />
          {textoPlan}
        </label>
      )}
      {error && <span role="alert" style={{ color: 'var(--negative)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={ocupado} onClick={() => void guardar()} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" disabled={ocupado} onClick={() => setAbierto(false)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
      </div>
    </div>
  )
}
