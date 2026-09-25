'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'

/**
 * «Eliminar» una tarjeta del cubo Oportunidades de la ficha (25/09/2026), SIEMPRE con
 * confirmación: nada se borra de un clic. Dos casos, y ninguno borra filas:
 * - `poliza`: póliza del volcado propuesta como lead, o viva cancelada/vencida/en
 *   competencia → se marca en la póliza (`lead_descartado_at`) y se puede recuperar.
 * - `oportunidad`: una abierta → se DESCARTA (perdida con motivo `error_alta`): queda
 *   su historial y no cuenta como venta perdida.
 */
async function post(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>): Promise<string | null> {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
  return r.ok && j?.estado === 'ok' ? null : j?.motivo ?? `No se ha eliminado (HTTP ${r.status}).`
}

const MOTIVOS = ['Duplicada', 'Ya no tiene ese seguro', 'No es un cliente para esto', 'Otro'] as const

export default function EliminarDeOportunidades(props: { tipo: 'poliza'; polizaId: string; oportunidadId?: string } | { tipo: 'oportunidad'; oportunidadId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState<string>('')
  const [detalle, setDetalle] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const texto = motivo === 'Otro' ? detalle.trim() : [motivo, detalle.trim()].filter(Boolean).join(' · ')
  const valido = motivo !== '' && (motivo !== 'Otro' || detalle.trim() !== '')

  async function confirmar() {
    setOcupado(true); setError(null)
    try {
      // Primero el seguimiento abierto (si lo hay): si se quitara solo la póliza, la
      // oportunidad quedaría suelta y volvería a salir como tarjeta.
      if (props.oportunidadId) {
        const e = await post('/api/correduria/oportunidad', 'POST', { id: props.oportunidadId, accion: 'perder', motivo: 'error_alta', detalle: texto })
        if (e) return setError(e)
      }
      if (props.tipo === 'poliza') {
        const e = await post('/api/correduria/poliza', 'PATCH', { id: props.polizaId, campo: 'lead_descartado', descartar: true, motivo: texto })
        if (e) return setError(props.oportunidadId ? `Se descartó su seguimiento, pero la póliza no se ha quitado: ${e}` : e)
      }
      setAbierto(false)
      router.refresh()
    } catch {
      setError('Sin conexión: no se sabe si se eliminó. Recarga antes de repetirlo.')
    } finally {
      setOcupado(false)
    }
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, color: 'var(--negative)', justifySelf: 'start' }}>
        🗑️ Eliminar
      </button>
    )
  }
  return (
    <div role="group" aria-label="Confirmar eliminación" style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 10, border: '1px solid var(--negative)', fontSize: 13 }}>
      <strong>¿Eliminarla de Oportunidades?</strong>
      <label style={{ display: 'grid', gap: 4, color: 'var(--muted)' }}>Por qué (obligatorio)
        <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', padding: '0 8px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="">Elige…</option>
          {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <input value={detalle} onChange={e => setDetalle(e.target.value)} maxLength={200} placeholder={motivo === 'Otro' ? 'Cuéntalo (obligatorio)' : 'Detalle (opcional)'}
        style={{ minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14 }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
        {props.tipo === 'poliza'
          ? 'No se borra la póliza: deja de salir como oportunidad y se puede recuperar.'
          : 'Se descarta: queda su historial y no cuenta como venta perdida.'}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={!valido || ocupado} onClick={() => void confirmar()}
          style={{ ...btnStyle('primario', 'sm'), minHeight: 44, background: 'var(--negative)', borderColor: 'var(--negative)' }}>
          {ocupado ? 'Eliminando…' : 'Sí, eliminar'}
        </button>
        <button type="button" disabled={ocupado} onClick={() => { setAbierto(false); setError(null) }} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Cancelar</button>
      </div>
      {error && <span role="alert" style={{ color: 'var(--negative)' }}>{error}</span>}
    </div>
  )
}

/** Deshace un «Eliminar» de una póliza: vuelve a salir como oportunidad. */
export function RecuperarLead({ polizaId }: { polizaId: string }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function recuperar() {
    setOcupado(true); setError(null)
    try {
      const r = await fetch('/api/correduria/poliza', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: polizaId, campo: 'lead_descartado', descartar: false }) })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (r.ok && j?.estado === 'ok') { router.refresh(); return }
      setError(j?.motivo ?? `HTTP ${r.status}`)
    } catch {
      setError('sin conexión')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <>
      <button type="button" disabled={ocupado} onClick={() => void recuperar()} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>↩︎ Recuperar</button>
      {error && <span role="alert" style={{ color: 'var(--negative)' }}> No se ha recuperado ({error}).</span>}
    </>
  )
}
