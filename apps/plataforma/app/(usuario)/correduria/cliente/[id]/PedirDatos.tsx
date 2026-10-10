'use client'
import { useCallback, useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { Ico, FILA } from '../../iconos'
import { interpretarSolicitudesDatos, type SolicitudesDatos } from '@/lib/seguimiento-asegura'
import { enlaceWhatsappConMensaje } from '@/lib/telefono-wa'
import { fmt } from './piezas'
import { RespuestasSolicitud } from './RespuestasSolicitud'

/**
 * «Pídele los datos al cliente» (24/09/2026). Genera un enlace para mandarle por
 * WhatsApp o correo; él rellena lo que falta (carné, matrícula, la moto…) y aquí
 * aparece lo que ha contestado, con el acceso directo a tarificar. El aviso de que
 * lo ha completado llega por Telegram (actividad del cliente) y como tarea de hoy.
 *
 * El enlace solo se ve al crearlo: asegura guarda su huella, no el enlace. Si se
 * pierde, se anula y se crea otro.
 */
export default function PedirDatos({ oportunidadId, clienteId, telefono = null, ramo }: { oportunidadId: string; clienteId: string; telefono?: string | null; ramo: 'moto' | 'auto' }) {
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

  // Al chat del CLIENTE, no a la lista de chats; sin móvil en la ficha se cae al genérico y se dice.
  const waDirecto = nuevo && telefono ? enlaceWhatsappConMensaje(telefono, nuevo.mensaje) : null
  // Solo las del CLIENTE: las de un familiar del riesgo (`tercero`) se ven en la pantalla del riesgo,
  // y contarlas aquí pintaría sus respuestas como «el cliente contestó». `null` (asegura vieja) = del cliente.
  const solicitudes = lectura?.estado === 'ok' ? lectura.solicitudes.filter((s) => s.tercero !== true) : []
  const completada = solicitudes.find((s) => s.estado === 'completada')
  const pendiente = solicitudes.find((s) => s.estado === 'pendiente')
  // Con `?oportunidad=` para volver al MISMO borrador (su clave lleva la oportunidad).
  const tarificar = `/correduria/cliente/${clienteId}/${ramo === 'moto' ? 'moto-nuevo' : 'auto-nuevo'}?oportunidad=${encodeURIComponent(oportunidadId)}`

  return (
    <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      {lectura?.estado === 'error' && <div style={{ color: 'var(--muted)' }}>No se han podido mirar los enlaces de datos ({lectura.motivo}).</div>}

      {nuevo && (
        <div style={{ display: 'grid', gap: 6, background: 'var(--surface-2, var(--surface))', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
          <div style={{ fontWeight: 600 }}>Enlace listo (caduca el {fmt(nuevo.caduca.slice(0, 10))}). Mándaselo tú:</div>
          <input readOnly value={nuevo.url} onFocus={(e) => e.currentTarget.select()} style={{ minHeight: 44, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', width: '100%', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void copiar(nuevo.mensaje)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>{copiado ? 'Copiado' : 'Copiar mensaje'}</button>
            <a href={waDirecto ?? `https://wa.me/?text=${encodeURIComponent(nuevo.mensaje)}`} target="_blank" rel="noreferrer" style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>WhatsApp</a>
          </div>
          {!waDirecto && (
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {telefono ? 'Su teléfono de la ficha no es un móvil: WhatsApp te pedirá elegir el chat.' : 'No tiene teléfono en su ficha: WhatsApp te pedirá elegir el chat.'}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>El enlace no enseña nada del cliente: solo le pide lo que falta. Lo que conteste se verifica al emitir.</div>
        </div>
      )}

      {completada && <RespuestasSolicitud s={completada} quien="El cliente" tarificar={{ href: tarificar, ramo }} />}

      {!nuevo && pendiente && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...FILA, color: 'var(--muted)' }}><Ico i={Link2} size={13} /> Datos pedidos por enlace; sin contestar (caduca el {fmt(pendiente.caduca.slice(0, 10))}).</span>
          <button type="button" disabled={ocupado} onClick={() => void anular(pendiente.id)} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Anular enlace</button>
        </div>
      )}

      {!nuevo && !pendiente && lectura?.estado === 'ok' && (
        <div>
          <button type="button" disabled={ocupado} onClick={() => void crear()} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
            {ocupado ? 'Creando…' : <><Ico i={Link2} /> {completada ? 'Pedir otra vez datos por enlace' : 'Pedir datos al cliente por enlace'}</>}
          </button>
        </div>
      )}
      {aviso && <div role="status" style={{ fontSize: 12 }}>{aviso}</div>}
    </div>
  )
}
