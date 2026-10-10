'use client'

// «Pedirle los datos por enlace» a una persona del riesgo que NO es el cliente (29/09/2026): el
// padre propietario, la hija conductora… Crea la solicitud con su `personaId`; asegura redacta el
// mensaje para un tercero y la página del enlace le pide el consentimiento. Alberto elige a quién se
// lo manda (wa.me sin número): al familiar o al cliente, que entonces marca que tiene su permiso.
// Mismo patrón que `cliente/[id]/PedirDatos.tsx`; las respuestas se pintan con su misma pieza.

import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import type { SolicitudDatos } from '@/lib/seguimiento-asegura'
import { Ico, FILA } from '../../iconos'
import { fmt } from '../../cliente/[id]/piezas'
import { RespuestasSolicitud } from '../../cliente/[id]/RespuestasSolicitud'

export default function PedirDatosFigura({ oportunidadId, personaId, nombre, solicitudes, sinLeer, onCambio }: {
  oportunidadId: string
  personaId: string
  nombre: string
  /** Las solicitudes de ESTA persona (más reciente primero). */
  solicitudes: SolicitudDatos[]
  /** `true` = no se han podido mirar los enlaces: no se ofrece crear otro a ciegas. */
  sinLeer: boolean
  onCambio: () => void
}) {
  const [nuevo, setNuevo] = useState<{ url: string; mensaje: string; caduca: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function post(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> | null }> {
    try {
      const res = await fetch('/api/correduria/solicitud-datos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null }
    } catch {
      return { status: 0, json: { motivo: 'sin conexión' } }
    }
  }

  async function crear() {
    setOcupado(true); setAviso(null); setCopiado(false)
    const r = await post({ oportunidadId, personaId })
    setOcupado(false)
    const url = typeof r.json?.url === 'string' ? r.json.url : null
    if ((r.status === 201 || r.status === 200) && url) {
      setNuevo({ url, mensaje: typeof r.json?.mensaje === 'string' ? r.json.mensaje : url, caduca: String(r.json?.caduca ?? '') })
    } else if (r.status === 200) {
      setAviso(`Ya hay un enlace sin contestar para ${nombre}. Si no lo tienes, anúlalo y crea otro.`)
    } else {
      setAviso(`No se ha creado: ${typeof r.json?.motivo === 'string' ? r.json.motivo : `HTTP ${r.status}`}`)
    }
    onCambio()
  }

  async function anular(id: string) {
    setOcupado(true)
    const r = await post({ accion: 'anular', id })
    setOcupado(false)
    setAviso(r.status === 200 ? 'Enlace anulado: ya no funciona.' : `No se ha anulado (HTTP ${r.status}).`)
    setNuevo(null)
    onCambio()
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true) } catch { setCopiado(false) }
  }

  const completada = solicitudes.find((s) => s.estado === 'completada')
  const pendiente = solicitudes.find((s) => s.estado === 'pendiente')

  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 13, minWidth: 0 }}>
      {nuevo && (
        <div style={{ display: 'grid', gap: 6, background: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>Enlace listo{nuevo.caduca ? ` (caduca el ${fmt(nuevo.caduca.slice(0, 10))})` : ''}. Mándalo tú:</div>
          <input readOnly value={nuevo.url} onFocus={(e) => e.currentTarget.select()} style={{ minHeight: 44, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box', minWidth: 0 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void copiar(nuevo.mensaje)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>{copiado ? 'Copiado' : 'Copiar mensaje'}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(nuevo.mensaje)}`} target="_blank" rel="noreferrer" style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>WhatsApp</a>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            WhatsApp te deja elegir el chat: a {nombre} o al cliente. Si se lo mandas al cliente, él marcará que tiene permiso de esa persona.
          </div>
        </div>
      )}

      {completada && <RespuestasSolicitud s={completada} quien={nombre} tarificar={null} />}

      {!nuevo && pendiente && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...FILA, color: 'var(--muted)' }}><Ico i={Link2} size={13} /> Datos pedidos por enlace; sin contestar (caduca el {fmt(pendiente.caduca.slice(0, 10))}).</span>
          <button type="button" disabled={ocupado} onClick={() => void anular(pendiente.id)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Anular enlace</button>
        </div>
      )}

      {!nuevo && !pendiente && !sinLeer && (
        <div>
          <button type="button" disabled={ocupado} onClick={() => void crear()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, whiteSpace: 'normal', height: 'auto', textAlign: 'left' }}>
            {ocupado ? 'Creando…' : <><Ico i={Link2} /> {completada ? 'Pedirle otra vez los datos por enlace' : 'Pedirle los datos por enlace'}</>}
          </button>
        </div>
      )}
      {aviso && <div role="status" style={{ fontSize: 12 }}>{aviso}</div>}
    </div>
  )
}
