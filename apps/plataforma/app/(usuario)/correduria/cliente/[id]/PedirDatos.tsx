'use client'
import { useCallback, useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { Ico, FILA } from '../../iconos'
import type { RamoSolicitud } from '@central/module-seguros'
import { interpretarSolicitudesDatos, type SolicitudesDatos } from '@/lib/seguimiento-asegura'
import { enlaceWhatsappConMensaje } from '@/lib/telefono-wa'
import { resultadoPedirDatos } from '@/lib/correduria/pedir-datos'
import { fmt } from './piezas'
import { RespuestasSolicitud } from './RespuestasSolicitud'

/**
 * «Pídele los datos al cliente» (24/09/2026). Genera un enlace para mandarle por
 * WhatsApp o correo; él rellena lo que falta (carné, matrícula, la moto…) y aquí
 * aparece lo que ha contestado, con el acceso directo a tarificar. El aviso de que
 * lo ha completado llega por Telegram (actividad del cliente) y como tarea de hoy.
 *
 * El enlace solo se ve al crearlo: asegura guarda su huella, no el enlace. Si se
 * pierde, «Renovar enlace» (26/10/2026, `reemitir`) le da uno nuevo a la MISMA solicitud: lo que el cliente tuviera a
 * medias y el plazo se conservan, y el anterior deja de funcionar. «Anular enlace» sigue para cerrarlo de verdad.
 */
/** Pantalla de pedir precio de cada ramo (25/10/2026: el enlace vale para todos; el atajo, solo donde hay pantalla). */
const PANTALLA_TARIFICAR: Partial<Record<RamoSolicitud, string>> = {
  moto: 'moto-nuevo', auto: 'auto-nuevo', hogar: 'hogar-nuevo', vida: 'vida-nuevo', salud: 'salud-nuevo', decesos: 'decesos-nuevo',
}

export default function PedirDatos({ oportunidadId, clienteId, telefono = null, ramo }: { oportunidadId: string; clienteId: string; telefono?: string | null; ramo: RamoSolicitud }) {
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
    // Con una viva, asegura RENUEVA su enlace (misma solicitud, nada se pierde); sin ella, la crea.
    const r = await post({ oportunidadId, reemitir: true })
    setOcupado(false)
    const res = resultadoPedirDatos(r.status, r.json)
    if (res.ok) setNuevo({ url: res.url, mensaje: res.mensaje, caduca: res.caduca })
    setAviso(res.aviso)
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
  // Solo los ramos con pantalla de pedir precio; el resto se cotiza fuera (sin atajo).
  const pantalla = PANTALLA_TARIFICAR[ramo]
  const tarificar = pantalla ? `/correduria/cliente/${clienteId}/${pantalla}?oportunidad=${encodeURIComponent(oportunidadId)}` : null

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

      {completada && <RespuestasSolicitud s={completada} quien="El cliente" tarificar={tarificar ? { href: tarificar, ramo } : null} />}

      {!nuevo && pendiente && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ ...FILA, color: 'var(--muted)' }}><Ico i={Link2} size={13} /> Datos pedidos por enlace; sin contestar (caduca el {fmt(pendiente.caduca.slice(0, 10))}).</span>
          <button type="button" disabled={ocupado} onClick={() => void crear()} title="Da un enlace nuevo a esta misma petición: lo que el cliente tenga a medias se conserva y el anterior deja de funcionar" style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>{ocupado ? 'Renovando…' : 'Renovar enlace'}</button>
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
