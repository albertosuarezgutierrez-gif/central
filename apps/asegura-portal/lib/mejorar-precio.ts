/**
 * «Quiero que me mejores el precio» (pieza 1-5): el lado del portal.
 *
 * El portal no escribe en la cartera: manda la petición por el puente estrecho
 * de asegura (`/api/portal/mejorar-precio`), que resuelve la ficha por
 * `portal_vinculo`, crea la oportunidad y la tarea de hoy para Alberto.
 *
 * Las respuestas se interpretan en funciones PURAS (probadas sin red): un 401
 * por un secreto mal puesto o un corte NO pueden pintarse como «recibido» —
 * la persona se quedaría esperando una llamada que nadie va a hacer.
 */
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type PeticionAbierta = { polizaId: string; pedidoEl: string }

export type ResultadoPedirPrecio =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'no_disponible'; motivo: string }
  /** No se sabe si llegó (corte, 5xx, puente sin configurar): se dice así. */
  | { estado: 'error' }

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export function interpretarPedirPrecio(status: number, j: unknown): ResultadoPedirPrecio {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (status === 200 && o.estado === 'ok' && typeof o.pedidoEl === 'string' && FECHA.test(o.pedidoEl)) {
    return { estado: 'ok', pedidoEl: o.pedidoEl, yaExistia: o.yaExistia === true }
  }
  if (o.estado === 'invalido') return { estado: 'invalido', motivo: typeof o.motivo === 'string' ? o.motivo : 'Revisa lo que has marcado.' }
  if (o.estado === 'fuera_de_ventana') return { estado: 'no_disponible', motivo: 'Esta póliza no renueva en los próximos dos meses.' }
  if (o.estado === 'no_encontrada' || o.estado === 'sin_ficha') {
    return { estado: 'no_disponible', motivo: 'No encontramos esta póliza entre las tuyas. Escríbenos y lo miramos.' }
  }
  return { estado: 'error' }
}

/** `null` = no se pudo saber (puente caído o sin configurar): NO es «no has pedido nada». */
export function interpretarPeticiones(status: number, j: unknown): PeticionAbierta[] | null {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (status === 409 && o.estado === 'sin_ficha') return []
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.peticiones)) return null
  return o.peticiones.flatMap((p): PeticionAbierta[] => {
    const x = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
    return typeof x.polizaId === 'string' && typeof x.pedidoEl === 'string' && FECHA.test(x.pedidoEl)
      ? [{ polizaId: x.polizaId, pedidoEl: x.pedidoEl }]
      : []
  })
}

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

async function llamar(ruta: string, init: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}${ruta}`, {
      ...init,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error(`[portal/mejorar-precio] el puente no respondió (${ruta}):`, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function peticionesPrecio(identidadId: string): Promise<PeticionAbierta[] | null> {
  const r = await llamar(`/api/portal/mejorar-precio?identidadId=${encodeURIComponent(identidadId)}`, { method: 'GET' })
  return r ? interpretarPeticiones(r.status, r.json) : null
}

export async function pedirPrecio(identidadId: string, polizaId: string, datos: Record<string, unknown>): Promise<ResultadoPedirPrecio> {
  const r = await llamar('/api/portal/mejorar-precio', {
    method: 'POST',
    body: JSON.stringify({ prioridad: datos.prioridad, canal: datos.canal, momento: datos.momento, nota: datos.nota, identidadId, polizaId }),
  })
  if (!r) return { estado: 'error' }
  const res = interpretarPedirPrecio(r.status, r.json)
  if (res.estado === 'error') console.warn('[portal/mejorar-precio] respuesta no esperada del puente:', r.status)
  return res
}
