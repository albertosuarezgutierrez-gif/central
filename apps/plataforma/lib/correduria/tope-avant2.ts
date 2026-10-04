// Tope de gasto de Avant2 en EUROS (decisión de Alberto, 29/09/2026): el lado de plataforma.
//
// asegura decide y anota (aviso a 60 €, bloqueo a 70 €, ampliaciones de +30 €) en
// `seguros.codeoscopic_tope_evento`; plataforma tiene el bot. Este fichero:
//   - lee por el puerto los avisos/bloqueos pendientes, con su texto y su botón ya hechos;
//   - marca los que ya salieron por Telegram;
//   - reenvía a asegura la pulsación del botón «Autorizar +30 €» (`cas_tope:<AAAAMM>-<nivel>`).
//
// 🚨 «No se ha podido mirar» NUNCA es «no hay nada pendiente»: cualquier duda → `sin_datos`.
import { cabecerasPuerto } from '../puerto-actor.ts'

export const ACCION_BOTON_TOPE = 'tope'
/** Mismo actor que el resto de botones del asistente de la correduría; quién pulsó va en `autorizadoPor`. */
const ACTOR_BOTON_TOPE = 'agente:asistente-telegram'

export type PendienteTope = {
  id: string
  tipo: 'aviso' | 'bloqueo'
  texto: string
  boton: { texto: string; callback: string } | null
}

export type LecturaTope =
  | { estado: 'ok'; gastadoCents: number; topeCents: number; pendientes: PendienteTope[] }
  | { estado: 'sin_datos'; causa: string }

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/** PURO. Interpreta la respuesta del GET del puerto. */
export function interpretarLecturaTope(status: number, json: unknown): LecturaTope {
  const o = obj(json)
  if (status === 401 || status === 403) return { estado: 'sin_datos', causa: 'asegura rechaza el secreto' }
  if (status === 404) return { estado: 'sin_datos', causa: 'asegura aún no tiene /api/operador/codeoscopic/tope desplegado' }
  if (status === 503 || o.estado === 'sin_configurar') return { estado: 'sin_datos', causa: 'asegura sin base de datos configurada' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.pendientes)) {
    const causa = typeof o.motivo === 'string' ? o.motivo : typeof o.causa === 'string' ? o.causa : JSON.stringify(o.causa ?? null)
    return { estado: 'sin_datos', causa: `HTTP ${status}: ${causa}` }
  }
  if (typeof o.gastadoCents !== 'number' || typeof o.topeCents !== 'number') {
    return { estado: 'sin_datos', causa: 'asegura no devolvió el gasto del mes' }
  }
  const pendientes: PendienteTope[] = []
  for (const bruto of o.pendientes) {
    const p = obj(bruto)
    const b = p.boton === null ? null : obj(p.boton)
    if (
      typeof p.id !== 'string' ||
      (p.tipo !== 'aviso' && p.tipo !== 'bloqueo') ||
      typeof p.texto !== 'string' ||
      (b !== null && (typeof b.texto !== 'string' || typeof b.callback !== 'string'))
    ) {
      return { estado: 'sin_datos', causa: 'asegura devolvió un evento sin forma' }
    }
    // Un bloqueo SIN botón dejaría a Alberto sin forma de desbloquear: no se manda así.
    if (p.tipo === 'bloqueo' && b === null) return { estado: 'sin_datos', causa: 'bloqueo sin botón de ampliar' }
    pendientes.push({
      id: p.id,
      tipo: p.tipo,
      texto: p.texto,
      boton: b === null ? null : { texto: String(b.texto), callback: String(b.callback) },
    })
  }
  return { estado: 'ok', gastadoCents: o.gastadoCents, topeCents: o.topeCents, pendientes }
}

/** PURO. El toast y la línea que se añade al mensaje tras pulsar «Autorizar». */
export function resultadoAmpliar(status: number, json: unknown): { toast: string; linea: string } {
  const o = obj(json)
  const tope = typeof o.topeCents === 'number' ? eur(o.topeCents) : null
  if (status === 200 && o.estado === 'ampliado') {
    return { toast: '✅ Ampliado +30€', linea: `✅ <b>Autorizado.</b> Nuevo tope del mes: ${tope ?? '(no leído)'}.` }
  }
  if (status === 200 && o.estado === 'ya_estaba') {
    return { toast: 'Ya estaba autorizado', linea: `ℹ️ Ya estaba autorizado: no se suma dos veces. Tope del mes: ${tope ?? '(no leído)'}.` }
  }
  if (status === 409) {
    return { toast: 'No se amplía', linea: `✋ ${typeof o.motivo === 'string' ? o.motivo : 'No se amplía nada.'}` }
  }
  // Fallo de red/5xx: NO se sabe si se escribió. Se dice así, y pulsar otra vez es seguro (idempotente).
  return {
    toast: 'No sé si se ha ampliado',
    linea: '⚠️ No he podido confirmar la ampliación con asegura. Pulsa otra vez: si ya estaba hecha, no se suma dos veces.',
  }
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'
}

function base(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function leerTopeAvant2(): Promise<LecturaTope> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return { estado: 'sin_datos', causa: 'puerto sin configurar (falta ASEGURA_OPERADOR_SECRET)' }
  try {
    const res = await fetch(`${base()}/api/operador/codeoscopic/tope`, {
      headers: { ...(await cabecerasPuerto(secreto)) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return interpretarLecturaTope(res.status, await res.json().catch(() => null))
  } catch {
    return { estado: 'sin_datos', causa: 'no se pudo llegar a asegura (timeout, DNS o TLS)' }
  }
}

/** Marca como mandados. Si falla, el evento se vuelve a mandar en la pasada siguiente. */
export async function marcarTopeNotificado(ids: string[]): Promise<boolean> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto || ids.length === 0) return false
  try {
    const res = await fetch(`${base()}/api/operador/codeoscopic/tope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabecerasPuerto(secreto)) },
      body: JSON.stringify({ accion: 'notificado', ids }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return res.status === 200
  } catch {
    return false
  }
}

/** El botón «Autorizar +30 €». Nunca lanza. */
export async function ampliarTopeAvant2(arg: string, autorizadoPor: string, callbackId: string): Promise<{ toast: string; linea: string }> {
  const secreto = process.env.ASEGURA_OPERADOR_SECRET
  if (!secreto) return { toast: 'Puerto sin configurar', linea: '⚠️ Falta ASEGURA_OPERADOR_SECRET en plataforma: no se ha ampliado nada.' }
  try {
    const res = await fetch(`${base()}/api/operador/codeoscopic/tope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabecerasPuerto(secreto, ACTOR_BOTON_TOPE)) },
      body: JSON.stringify({ accion: 'ampliar', arg, autorizadoPor: `telegram:${autorizadoPor}`, callbackId }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    return resultadoAmpliar(res.status, await res.json().catch(() => null))
  } catch {
    return resultadoAmpliar(0, null)
  }
}
