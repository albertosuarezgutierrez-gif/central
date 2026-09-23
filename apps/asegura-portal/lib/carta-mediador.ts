/**
 * «Quédate con tu seguro, pero llévamelo yo» (salida B del presupuesto, PR 6): el cliente firma la
 * carta que nombra a la correduría mediadora de su póliza actual. Por el puente de asegura
 * (`/api/portal/carta-mediador`), igual que la aceptación: el portal no escribe la cartera.
 *
 * Intérpretes PUROS: un 401, un 5xx o un corte NUNCA es «firmada» — la persona creería que ya somos
 * su corredor y nadie lo habría registrado.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function obj(j: unknown): Record<string, unknown> {
  return (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
}

export type Preparada =
  | { estado: 'ok'; carta: string; cartaHash: string; consentimiento: string }
  | { estado: 'ya_firmada'; enviada: boolean }
  | { estado: 'no_disponible'; motivo: string }

const OTRA = 'Este presupuesto es de otra persona: la carta la firma ella desde su propio acceso.'
const SIN_FICHA = 'No podemos asociar la carta a tu ficha desde aquí. Escríbenos y lo hacemos contigo.'

function noDisponible(o: Record<string, unknown>): { estado: 'no_disponible'; motivo: string } | null {
  if (o.estado === 'otra_ficha') return { estado: 'no_disponible', motivo: OTRA }
  if (o.estado === 'sin_ficha' || o.estado === 'varias_fichas') return { estado: 'no_disponible', motivo: SIN_FICHA }
  if (o.estado === 'no_encontrado') return { estado: 'no_disponible', motivo: 'Este presupuesto ya no está disponible. Recarga la página.' }
  if (o.estado === 'no_disponible' && typeof o.motivo === 'string') return { estado: 'no_disponible', motivo: o.motivo }
  return null
}

/** `null` = no se ha podido leer. */
export function interpretarPreparada(status: number, j: unknown): Preparada | null {
  const o = obj(j)
  if (status === 200 && o.estado === 'ok') {
    if (typeof o.carta !== 'string' || !o.carta.trim() || typeof o.cartaHash !== 'string' || !/^[0-9a-f]{64}$/.test(o.cartaHash)
      || typeof o.consentimiento !== 'string') return null
    return { estado: 'ok', carta: o.carta, cartaHash: o.cartaHash, consentimiento: o.consentimiento }
  }
  if (o.estado === 'ya_firmada') return { estado: 'ya_firmada', enviada: o.enviada === true }
  return noDisponible(o)
}

export type ResultadoCodigoCarta =
  | { estado: 'codigo_enviado'; email: string; minutos: number }
  | { estado: 'espera'; segundos: number }
  | { estado: 'no_disponible'; motivo: string }
  | { estado: 'error' }

export function interpretarCodigoCarta(status: number, j: unknown): ResultadoCodigoCarta {
  const o = obj(j)
  if (status === 200 && o.estado === 'codigo_enviado' && typeof o.email === 'string' && typeof o.minutos === 'number') {
    return { estado: 'codigo_enviado', email: o.email, minutos: o.minutos }
  }
  if (o.estado === 'espera' && typeof o.segundos === 'number') return { estado: 'espera', segundos: o.segundos }
  if (o.estado === 'limite_codigos') return { estado: 'no_disponible', motivo: 'Hoy ya te hemos mandado varios códigos. Inténtalo mañana o llámanos.' }
  if (o.estado === 'sin_email') return { estado: 'no_disponible', motivo: 'No tenemos un correo tuyo al que mandarte el código. Llámanos y lo hacemos contigo.' }
  if (o.estado === 'ya_firmada') return { estado: 'no_disponible', motivo: 'Ya firmaste esta carta. Recarga la página.' }
  const nd = noDisponible(o)
  if (nd) return nd
  // sin_correo_configurado, fallo_envio, 401, corte: no ha salido, y no por algo suyo.
  return { estado: 'error' }
}

export type ResultadoFirmaCarta =
  | { estado: 'firmada'; firmadaEl: string; aviso: string | null }
  | { estado: 'reintentar'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  | { estado: 'error' }

export function interpretarFirmaCarta(status: number, j: unknown): ResultadoFirmaCarta {
  const o = obj(j)
  if (status === 200 && o.estado === 'firmada' && typeof o.firmadaEl === 'string' && FECHA.test(o.firmadaEl)) {
    return { estado: 'firmada', firmadaEl: o.firmadaEl, aviso: typeof o.aviso === 'string' && o.aviso.trim() ? o.aviso : null }
  }
  if (o.estado === 'codigo_incorrecto') {
    const q = typeof o.quedan === 'number' ? o.quedan : null
    return { estado: 'reintentar', motivo: q === 0 ? 'Código incorrecto. Pide uno nuevo.' : `Código incorrecto.${q === null ? '' : ` Te quedan ${q} intento${q === 1 ? '' : 's'}.`}` }
  }
  if (o.estado === 'nombre_no_coincide') return { estado: 'reintentar', motivo: 'Escribe tu nombre y apellidos tal como figuran en la carta.' }
  if (o.estado === 'codigo_caducado') return { estado: 'reintentar', motivo: 'El código ha caducado. Pide uno nuevo.' }
  if (o.estado === 'sin_codigo' || o.estado === 'demasiados_intentos') return { estado: 'reintentar', motivo: 'Pide un código nuevo para firmar.' }
  if (o.estado === 'carta_cambiada') return { estado: 'no_disponible', motivo: 'La carta ha cambiado desde que la abriste. Recarga la página y léela de nuevo.' }
  if (o.estado === 'ya_firmada') return { estado: 'no_disponible', motivo: 'Ya firmaste esta carta. Recarga la página.' }
  return noDisponible(o) ?? { estado: 'error' }
}

async function llamar(cuerpo: Record<string, unknown>): Promise<{ status: number; json: unknown } | null> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/carta-mediador`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/carta-mediador] el puente no respondió:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function prepararCarta(identidadId: string, presupuestoId: string): Promise<Preparada | null> {
  const r = await llamar({ accion: 'preparar', identidadId, presupuestoId })
  return r ? interpretarPreparada(r.status, r.json) : null
}

export async function pedirCodigoCarta(identidadId: string, presupuestoId: string): Promise<ResultadoCodigoCarta> {
  const r = await llamar({ accion: 'codigo', identidadId, presupuestoId })
  return r ? interpretarCodigoCarta(r.status, r.json) : { estado: 'error' }
}

export async function firmarCarta(
  identidadId: string, presupuestoId: string,
  datos: { codigo: string; nombre: string; cartaHash: string; ip: string | null; userAgent: string | null },
): Promise<ResultadoFirmaCarta> {
  const r = await llamar({ accion: 'firmar', identidadId, presupuestoId, ...datos })
  return r ? interpretarFirmaCarta(r.status, r.json) : { estado: 'error' }
}
