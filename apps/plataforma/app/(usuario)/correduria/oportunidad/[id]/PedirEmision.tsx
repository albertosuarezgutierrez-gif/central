'use client'

// «Pedir emisión» (11/10/2026): bajo una tarificación terminada con oferta, pide al ROBOT que prepare la emisión del
// presupuesto que el cliente aceptó y firmó. NO emite: el robot para en la pantalla previa y Alberto da el OK por Telegram
// (24 h); el robot pulsa «Aceptar» una sola vez. Solo la persona de TARIFICADOR_EMISION_SOLICITANTE (si no, 403 y se dice).
// La visibilidad y los textos de error viven en `lib/tarificador-emision-boton.ts` (puro, con test); asegura re-comprueba todo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { eur } from '@/lib/dinero'
import { leerPresupuestoEnLista, type PresupuestoEnLista } from '@/lib/presupuesto-asegura'
import {
  TEXTO_CONFIRMACION, candidatosPresupuesto, leerRespuestaEmision, primaDeCompania, visibilidadEmision, type RespuestaEmision,
} from '@/lib/tarificador-emision-boton'

const guardarPendiente = (id: string) => { try { sessionStorage.setItem(`emision-pedida:${id}`, '1') } catch { /* sin almacenamiento: solo se pierde la comodidad */ } }
const hayPendiente = (id: string) => { try { return sessionStorage.getItem(`emision-pedida:${id}`) === '1' } catch { return false } }

export default function PedirEmision({ trabajoId, compania, nombreCompania, ramo, clienteId, primaOferta }: {
  trabajoId: string
  compania: string
  nombreCompania: string
  ramo: string
  clienteId: string
  /** Prima anual de la oferta del bot: se enseña si el presupuesto no da una prima inequívoca. */
  primaOferta: number | null
}) {
  const [lista, setLista] = useState<PresupuestoEnLista[] | null | 'error'>(null)
  const [elegido, setElegido] = useState<string>('')
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resp, setResp] = useState<RespuestaEmision | null>(null)
  const [pendientes, setPendientes] = useState<Record<string, true>>({})
  const cierre = useRef<HTMLButtonElement>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/correduria/presupuesto?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      const j = (await r.json().catch(() => null)) as { estado?: string; presupuestos?: unknown[] } | null
      if (!r.ok || j?.estado !== 'ok' || !Array.isArray(j.presupuestos)) { setLista('error'); return }
      const filas = j.presupuestos.map(leerPresupuestoEnLista)
      setLista(filas.some((f) => f === null) ? 'error' : (filas as PresupuestoEnLista[]))
    } catch {
      setLista('error')
    }
  }, [clienteId])
  useEffect(() => { void cargar() }, [cargar])

  const candidatos = Array.isArray(lista) ? candidatosPresupuesto(lista, { compania, ramo, clienteId }) : []
  const p = candidatos.find((c) => c.id === elegido) ?? (candidatos.length === 1 ? candidatos[0] : null)
  const enCurso = !!p && (pendientes[p.id] === true || hayPendiente(p.id))
  const v = visibilidadEmision({
    compania, ramo, estadoTrabajo: 'ok', conOferta: primaOferta !== null,
    estadoPresupuesto: p ? p.estado : candidatos.length > 1 ? 'aceptado' : null,
    ipidConsta: null, // la lista no trae la huella IPID: lo comprueba asegura y su 409 se muestra tal cual
    emisionEnCurso: enCurso,
  })

  useEffect(() => {
    if (!abierto) return
    cierre.current?.focus()
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alTecla)
    return () => window.removeEventListener('keydown', alTecla)
  }, [abierto])

  if (lista === 'error') {
    return <p role="status" style={{ margin: 0, fontSize: 12, color: 'var(--warning)' }}>No se han podido leer los presupuestos del cliente: no se ofrece «Pedir emisión». No es que no haya: no se ha podido mirar.</p>
  }
  if (!v.visible) return null

  const prima = p ? primaDeCompania(p, compania) ?? primaOferta : primaOferta

  async function pedir() {
    if (!p) return
    setEnviando(true)
    try {
      const res = await fetch('/api/correduria/tarificador/emision', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ presupuestoId: p.id, trabajoOrigenId: trabajoId }),
      })
      const r = leerRespuestaEmision(res.status, await res.json().catch(() => null))
      setResp(r)
      if (r.pendiente) { guardarPendiente(p.id); setPendientes((x) => ({ ...x, [p.id]: true })) }
    } catch {
      setResp({ tono: 'error', texto: 'No se ha podido pedir (red). No consta que se haya pedido: mira antes de repetir.', pendiente: false })
    } finally {
      setEnviando(false)
      setAbierto(false)
    }
  }

  const color = resp?.tono === 'error' ? 'var(--negative)' : resp?.tono === 'aviso' ? 'var(--warning)' : 'var(--text)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
      {candidatos.length > 1 && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--muted)', minWidth: 0 }}>
          Presupuesto aceptado a emitir
          <select value={elegido} onChange={(e) => setElegido(e.target.value)} style={{ minHeight: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, minWidth: 0 }}>
            <option value="">Elige…</option>
            {candidatos.map((c) => <option key={c.id} value={c.id}>{c.referencia ?? c.id.slice(0, 8)}{c.desdeEur !== null ? ` · desde ${eur(c.desdeEur)}` : ''}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => { setResp(null); setAbierto(true) }} disabled={!v.activo || !p || enviando} style={{ ...btnStyle('primario'), minHeight: 44, opacity: !v.activo || !p ? 0.6 : 1 }}>
          Pedir emisión
        </button>
        {(v.motivo || (candidatos.length > 1 && !p)) && (
          <span role="status" style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere', minWidth: 0 }}>{v.motivo ?? 'Elige el presupuesto aceptado.'}</span>
        )}
      </div>
      {v.aviso && v.activo && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{v.aviso}</span>}
      {resp && <div role={resp.tono === 'ok' ? 'status' : 'alert'} style={{ fontSize: 13, color, overflowWrap: 'anywhere' }}>{resp.texto}</div>}

      {abierto && p && (
        <div
          role="dialog" aria-modal="true" aria-label="Confirmar la petición de emisión"
          onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2.5vh 2.5vw' }}
        >
          <div style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, width: 'min(95vw, 460px)', maxHeight: '95vh', overflow: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, minWidth: 0, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Pedir emisión</div>
              <button ref={cierre} type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, minWidth: 44 }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gap: 2, fontSize: 14 }}>
              <span><strong>{nombreCompania}</strong> · {ramo}{p.referencia ? ` · ${p.referencia}` : ''}</span>
              <span>Prima: <strong>{prima === null ? '—' : eur(prima)}</strong> / año</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4 }}>{TEXTO_CONFIRMACION}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => void pedir()} disabled={enviando} style={{ ...btnStyle('primario'), minHeight: 44, flex: '1 1 140px' }}>{enviando ? 'Pidiendo…' : 'Pedir el OK por Telegram'}</button>
              <button type="button" onClick={() => setAbierto(false)} disabled={enviando} style={{ ...btnStyle('secundario'), minHeight: 44, flex: '1 1 100px' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
