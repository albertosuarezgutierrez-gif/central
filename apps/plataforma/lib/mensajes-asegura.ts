// Mensajes con el cliente (ASegura OS §Q.7): cliente del puerto de asegura (`/api/operador/mensajes`)
// + lectura defensiva y la frase de cada desenlace (puras, con test).
//
// El cliente escribe en su portal; aquí Alberto lo lee y contesta. Contestar es un clic suyo, y el
// aviso por correo al cliente («tienes una respuesta en tu área») sale solo si lo marca: no lleva el
// texto, que se queda en el portal.

import { cabecerasPuerto } from './puerto-actor.ts'

export type MensajeCorredor = {
  id: string
  autor: 'cliente' | 'corredor'
  cuerpo: string
  polizaId: string | null
  creadoAt: string
  leidoAt: string | null
  actor: string | null
}

export type PendienteMensaje = { clienteId: string; nombre: string | null; sinLeer: number; ultimoAt: string; ultimo: string }

export type LecturaHilo = { estado: 'ok'; mensajes: MensajeCorredor[] } | { estado: 'sin_datos'; causa: string }
export type LecturaPendientes = { estado: 'ok'; pendientes: PendienteMensaje[] } | { estado: 'sin_datos'; causa: string }

export type DesenlaceRespuesta = 'enviado' | 'no_encontrado' | 'invalido' | 'poliza_no_valida' | 'error'
export type AvisoRespuesta =
  | 'no_pedido' | 'enviado' | 'sin_email' | 'baja_de_correo' | 'ilegible' | 'sin_enlace'
  | 'sin_proveedor' | 'sin_remitente' | 'rechazado' | 'remitente_no_verificado' | 'desconocido'

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

export function leerMensaje(v: unknown): MensajeCorredor | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = texto(o.id), cuerpo = texto(o.cuerpo), creadoAt = texto(o.creadoAt)
  if (!id || !cuerpo || !creadoAt || (o.autor !== 'cliente' && o.autor !== 'corredor')) return null
  return { id, cuerpo, creadoAt, autor: o.autor, polizaId: texto(o.polizaId), leidoAt: texto(o.leidoAt), actor: texto(o.actor) }
}

export function leerPendiente(v: unknown): PendienteMensaje | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const clienteId = texto(o.clienteId), ultimoAt = texto(o.ultimoAt)
  if (!clienteId || !ultimoAt || typeof o.sinLeer !== 'number' || o.sinLeer < 1) return null
  return { clienteId, ultimoAt, nombre: texto(o.nombre), sinLeer: o.sinLeer, ultimo: texto(o.ultimo) ?? '' }
}

/** Una frase por desenlace de la respuesta. Ningún fallo puede leerse como «enviado». */
export function textoDesenlaceRespuesta(d: DesenlaceRespuesta): string {
  switch (d) {
    case 'enviado': return 'Respuesta guardada: el cliente la ve en su portal.'
    case 'no_encontrado': return 'NO guardada: esa ficha ya no está en la cartera.'
    case 'invalido': return 'NO guardada: escribe la respuesta (máximo 4.000 caracteres).'
    case 'poliza_no_valida': return 'NO guardada: esa póliza no es de este cliente.'
    default: return 'NO se sabe si se ha guardado: no se ha podido hablar con asegura. Recarga antes de repetir.'
  }
}

/** Qué pasó con el correo de aviso. Solo `enviado` dice que ha salido. */
export function textoAvisoRespuesta(a: AvisoRespuesta): string | null {
  switch (a) {
    case 'no_pedido': return null
    case 'enviado': return 'Le hemos avisado por correo (sin copiar el mensaje).'
    case 'sin_email': return 'No se le ha avisado: su ficha no tiene correo.'
    case 'baja_de_correo': return 'No se le ha avisado: pidió no recibir correos.'
    case 'ilegible': return 'No se le ha avisado: su correo no se puede leer (clave PII en asegura).'
    case 'sin_enlace': return 'No se le ha avisado: falta la dirección del portal (ASEGURA_PORTAL_URL).'
    case 'sin_proveedor':
    case 'sin_remitente': return 'No se le ha avisado: asegura no tiene correo configurado. Reintentarlo no lo arregla.'
    case 'remitente_no_verificado': return 'No se le ha avisado: el dominio del remitente no está verificado en Resend.'
    case 'rechazado': return 'No se le ha avisado: el proveedor de correo rechazó el envío.'
    default: return 'No se sabe si se le ha avisado.'
  }
}

const AVISOS: readonly string[] = ['no_pedido', 'enviado', 'sin_email', 'baja_de_correo', 'ilegible', 'sin_enlace', 'sin_proveedor', 'sin_remitente', 'rechazado', 'remitente_no_verificado']

function base(): { url: string; secreto: string } | null {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return null
  return { url: `${(process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')}/api/operador/mensajes`, secreto }
}

async function pedir(qs: string): Promise<{ status: number; j: Record<string, unknown> | null } | { causa: string }> {
  const b = base()
  if (!b) return { causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  try {
    const res = await fetch(`${b.url}${qs}`, { headers: await cabecerasPuerto(b.secreto), cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    return { status: res.status, j: (await res.json().catch(() => null)) as Record<string, unknown> | null }
  } catch {
    return { causa: 'no se pudo llegar a asegura' }
  }
}

/** Fichas con mensajes del cliente sin leer (la cola de «Hoy»). */
export async function leerPendientesMensajes(): Promise<LecturaPendientes> {
  const r = await pedir('')
  if ('causa' in r) return { estado: 'sin_datos', causa: r.causa }
  if (r.status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/mensajes desplegado' }
  if (r.j?.estado !== 'ok' || !Array.isArray(r.j.pendientes)) return { estado: 'sin_datos', causa: `HTTP ${r.status}` }
  const lista = r.j.pendientes.map(leerPendiente)
  if (lista.some(x => x === null)) return { estado: 'sin_datos', causa: 'asegura devolvió una fila incompleta' }
  return { estado: 'ok', pendientes: lista as PendienteMensaje[] }
}

/** El hilo entero de una ficha. */
export async function leerHilo(clienteId: string): Promise<LecturaHilo> {
  const r = await pedir(`?clienteId=${encodeURIComponent(clienteId)}`)
  if ('causa' in r) return { estado: 'sin_datos', causa: r.causa }
  if (r.status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/mensajes desplegado' }
  if (r.j?.estado !== 'ok' || !Array.isArray(r.j.mensajes)) return { estado: 'sin_datos', causa: `HTTP ${r.status}` }
  const lista = r.j.mensajes.map(leerMensaje)
  if (lista.some(x => x === null)) return { estado: 'sin_datos', causa: 'asegura devolvió un mensaje incompleto' }
  return { estado: 'ok', mensajes: lista as MensajeCorredor[] }
}

export async function escribirMensaje(cuerpo: Record<string, unknown>, actor: string): Promise<{ status: number; desenlace: DesenlaceRespuesta | 'hecho'; aviso: AvisoRespuesta }> {
  const b = base()
  if (!b) return { status: 503, desenlace: 'error', aviso: 'no_pedido' }
  try {
    const res = await fetch(b.url, {
      method: 'POST',
      headers: { ...(await cabecerasPuerto(b.secreto)), 'Content-Type': 'application/json' },
      // El actor, el ÚLTIMO: lo pone la sesión y no se puede pisar desde el cuerpo.
      body: JSON.stringify({ ...cuerpo, actor }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : 'error'
    const conocidos = ['enviado', 'hecho', 'no_encontrado', 'invalido', 'poliza_no_valida']
    const aviso = typeof j?.aviso === 'string' && AVISOS.includes(j.aviso) ? (j.aviso as AvisoRespuesta) : j?.aviso === undefined ? 'no_pedido' : 'desconocido'
    return { status: res.status, desenlace: conocidos.includes(estado) ? (estado as DesenlaceRespuesta | 'hecho') : 'error', aviso }
  } catch {
    // Timeout: la respuesta pudo guardarse. `error` dice «no se sabe», nunca «no se guardó».
    return { status: 504, desenlace: 'error', aviso: 'desconocido' }
  }
}
