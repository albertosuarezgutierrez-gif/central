// Cola única de aprobaciones (Fase 2 de ASegura OS, pieza 2-c): cliente del puerto de asegura
// (`/api/operador/aprobaciones`) + la frase de cada desenlace (pura, con test).
//
// Lo que aquí se aprueba SALE a un cliente: es la regla de la casa de comunicaciones salientes
// (ninguna sin el OK de Alberto para ESE envío), hecha botón.

import { cabecerasPuerto } from './puerto-actor.ts'

export type Aprobacion = {
  id: string
  origen: string
  clienteId: string
  cliente: string | null
  asunto: string
  texto: string
  urgente: boolean
  creada: string
  caduca: string
}

export type LecturaAprobaciones =
  | { estado: 'ok'; pendientes: Aprobacion[]; inciertos: number }
  | { estado: 'sin_datos'; causa: string }

export type Desenlace = 'ejecutada' | 'rechazada' | 'no_encontrada' | 'ya_decidida' | 'sin_email' | 'sin_correo_configurado' | 'fallida' | 'invalida' | 'error'

/** Una frase por desenlace. Ninguno de los fallos puede leerse como «el correo salió». */
export function textoDesenlace(d: Desenlace, motivo?: string | null): string {
  switch (d) {
    case 'ejecutada': return 'Enviado.'
    case 'rechazada': return 'Descartado: no se envía nada.'
    case 'no_encontrada': return 'No existe esa propuesta.'
    case 'ya_decidida': return 'Ya estaba decidida o ha caducado: no se ha enviado nada ahora.'
    case 'sin_email': return 'NO enviado: la ficha no tiene un correo legible. Sigue pendiente; añade el correo en la ficha.'
    case 'sin_correo_configurado': return `NO enviado: ${motivo ?? 'el correo de la correduría no está configurado'}. Sigue pendiente; reintentarlo no lo arregla.`
    case 'fallida': return `NO enviado: ${motivo ?? 'el proveedor rechazó el mensaje'}.`
    case 'invalida': return 'NO enviado: el asunto y el texto no pueden ir vacíos.'
    default: return 'NO se sabe si se ha enviado: no se ha podido hablar con asegura. Mira la lista antes de repetir.'
  }
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

export function leerAprobacion(v: unknown): Aprobacion | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = texto(o.id), clienteId = texto(o.clienteId), asunto = texto(o.asunto), cuerpo = texto(o.texto)
  if (!id || !clienteId || !asunto || !cuerpo) return null
  return {
    id, clienteId, asunto, texto: cuerpo,
    origen: texto(o.origen) ?? 'desconocido',
    cliente: texto(o.cliente),
    urgente: o.urgente === true,
    creada: texto(o.creada) ?? '',
    caduca: texto(o.caduca) ?? '',
  }
}

function base(): { url: string; secreto: string } | null {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return null
  return { url: `${(process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')}/api/operador/aprobaciones`, secreto }
}

export async function aprobacionesPendientes(): Promise<LecturaAprobaciones> {
  const b = base()
  if (!b) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  try {
    const res = await fetch(b.url, { headers: await cabecerasPuerto(b.secreto), cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (res.status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/aprobaciones desplegado' }
    if (!res.ok || j?.estado !== 'ok' || !Array.isArray(j.pendientes)) return { estado: 'sin_datos', causa: `HTTP ${res.status}` }
    const pendientes = j.pendientes.map(leerAprobacion)
    // Una fila ilegible no se esconde: si falta una, la lista no es la lista.
    if (pendientes.some(x => x === null)) return { estado: 'sin_datos', causa: 'asegura devolvió una propuesta incompleta' }
    return { estado: 'ok', pendientes: pendientes as Aprobacion[], inciertos: typeof j.inciertos === 'number' ? j.inciertos : 0 }
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura' }
  }
}

export async function decidir(cuerpo: { id: string; decision: 'aprobar' | 'rechazar'; asunto?: string; texto?: string }, actor: string): Promise<{ status: number; desenlace: Desenlace; motivo: string | null }> {
  const b = base()
  if (!b) return { status: 503, desenlace: 'error', motivo: null }
  try {
    const res = await fetch(b.url, {
      method: 'PATCH',
      headers: { ...(await cabecerasPuerto(b.secreto)), 'Content-Type': 'application/json' },
      // El actor, el ÚLTIMO: lo pone la sesión y no se puede pisar desde el cuerpo.
      body: JSON.stringify({ ...cuerpo, actor }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : 'error'
    const conocidos: Desenlace[] = ['ejecutada', 'rechazada', 'no_encontrada', 'ya_decidida', 'sin_email', 'sin_correo_configurado', 'fallida', 'invalida']
    return { status: res.status, desenlace: (conocidos as string[]).includes(estado) ? (estado as Desenlace) : 'error', motivo: texto(j?.motivo) }
  } catch {
    return { status: 504, desenlace: 'error', motivo: null }
  }
}
