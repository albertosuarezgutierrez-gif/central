'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'
import { interpretarSolicitudesDatos, valorLegible, type SolicitudDatos, type SolicitudesDatos } from '@/lib/seguimiento-asegura'
import { fmt } from './piezas'

/**
 * «Pídele los datos al cliente» (24/09/2026). Genera un enlace para mandarle por
 * WhatsApp o correo; él rellena lo que falta (carné, matrícula, la moto…) y aquí
 * aparece lo que ha contestado, con el acceso directo a tarificar. El aviso de que
 * lo ha completado llega por Telegram (actividad del cliente) y como tarea de hoy.
 *
 * El enlace solo se ve al crearlo: asegura guarda su huella, no el enlace. Si se
 * pierde, se anula y se crea otro.
 */
export default function PedirDatos({ oportunidadId, clienteId, ramo }: { oportunidadId: string; clienteId: string; ramo: 'moto' | 'auto' }) {
  const [lectura, setLectura] = useState<SolicitudesDatos | null>(null)
  const [nuevo, setNuevo] = useState<{ url: string; mensaje: string; caduca: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/correduria/solicitud-datos?oportunidadId=${encodeURIComponent(oportunidadId)}`)
      setLectura(interpretarSolicitudesDatos(res.status, await res.json().catch(() => null)))
    } catch {
      setLectura({ estado: 'error', motivo: 'sin conexión' })
    }
  }, [oportunidadId])
  useEffect(() => { void cargar() }, [cargar])

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
    const r = await post({ oportunidadId })
    setOcupado(false)
    const url = typeof r.json?.url === 'string' ? r.json.url : null
    if ((r.status === 201 || r.status === 200) && url) {
      setNuevo({ url, mensaje: typeof r.json?.mensaje === 'string' ? r.json.mensaje : url, caduca: String(r.json?.caduca ?? '') })
    } else if (r.status === 200) {
      setAviso('Ya hay un enlace sin contestar para esta oportunidad. Si no lo tienes, anúlalo y crea otro.')
    } else {
      setAviso(`No se ha creado: ${typeof r.json?.motivo === 'string' ? r.json.motivo : `HTTP ${r.status}`}`)
    }
    void cargar()
  }

  async function anular(id: string) {
    setOcupado(true)
    const r = await post({ accion: 'anular', id })
    setOcupado(false)
    setAviso(r.status === 200 ? 'Enlace anulado: ya no funciona.' : `No se ha anulado (HTTP ${r.status}).`)
    setNuevo(null)
    void cargar()
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true) } catch { setCopiado(false) }
  }

  const solicitudes = lectura?.estado === 'ok' ? lectura.solicitudes : []
  const completada = solicitudes.find((s) => s.estado === 'completada')
  const pendiente = solicitudes.find((s) => s.estado === 'pendiente')
  const tarificar = `/correduria/cliente/${clienteId}/${ramo === 'moto' ? 'moto-nuevo' : 'auto-nuevo'}`

  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {lectura?.estado === 'error' && <div style={{ color: 'var(--muted)' }}>No se han podido mirar los enlaces de datos ({lectura.motivo}).</div>}

      {nuevo && (
        <div style={{ display: 'grid', gap: 6, background: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
          <div style={{ fontWeight: 600 }}>Enlace listo (caduca el {fmt(nuevo.caduca.slice(0, 10))}). Mándaselo tú:</div>
          <input readOnly value={nuevo.url} onFocus={(e) => e.currentTarget.select()} style={{ minHeight: 44, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void copiar(nuevo.mensaje)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>{copiado ? '✅ Copiado' : '📋 Copiar mensaje'}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(nuevo.mensaje)}`} target="_blank" rel="noreferrer" style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>💬 WhatsApp</a>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>El enlace no enseña nada del cliente: solo le pide lo que falta. Lo que conteste se verifica al emitir.</div>
        </div>
      )}

      {completada && <Respuestas s={completada} tarificar={tarificar} ramo={ramo} />}

      {!nuevo && pendiente && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)' }}>🔗 Datos pedidos por enlace; sin contestar (caduca el {fmt(pendiente.caduca.slice(0, 10))}).</span>
          <button type="button" disabled={ocupado} onClick={() => void anular(pendiente.id)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Anular enlace</button>
        </div>
      )}

      {!nuevo && !pendiente && lectura?.estado === 'ok' && (
        <div>
          <button type="button" disabled={ocupado} onClick={() => void crear()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
            {ocupado ? 'Creando…' : completada ? '🔗 Pedir otra vez datos por enlace' : '🔗 Pedir datos al cliente por enlace'}
          </button>
        </div>
      )}
      {aviso && <div role="status" style={{ fontSize: 12 }}>{aviso}</div>}
    </div>
  )
}

function Respuestas({ s, tarificar, ramo }: { s: SolicitudDatos; tarificar: string; ramo: 'moto' | 'auto' }) {
  return (
    <details open>
      <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontWeight: 600, color: 'var(--positive)' }}>
        ✅ El cliente contestó{s.completada ? ` el ${fmt(s.completada.slice(0, 10))}` : ''}
      </summary>
      {s.ilegible || !s.respuestas ? (
        <div style={{ color: 'var(--negative)' }}>Sus respuestas no se pueden descifrar aquí (clave de datos personales).</div>
      ) : (
        <dl style={{ margin: '4px 0', display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px' }}>
          {s.campos.filter((c) => s.respuestas && c.clave in s.respuestas).map((c) => (
            <div key={c.clave} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--muted)' }}>{c.etiqueta}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{valorLegible(c, s.respuestas?.[c.clave])}</dd>
            </div>
          ))}
        </dl>
      )}
      <Link href={tarificar} style={{ ...btnStyle('primario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
        Tarificar {ramo === 'moto' ? 'moto' : 'coche'} →
      </Link>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Declarado por el cliente por el enlace: se verifica al emitir.</div>
    </details>
  )
}
