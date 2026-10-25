// PATRIMONIO (24/10/2026, P14) — el PUENTE de «Pedir precio» a `apps/asegura` (`/api/portal/patrimonio/pedir-precio`), a
// imagen de `inquilinos-puente.ts`. NO es `lead-declarada.ts` (que modela pólizas aportadas con vencimiento).
//
// El portal NO escribe en `oportunidades` (es del lado de la correduría y su rol no lo toca): manda `identidadId` +
// `inmuebleId` + `tipo` y recibe solo el desenlace. asegura NO se fía de este lado: no recibe ficha ni titular, la saca
// del inmueble y recalcula el nivel de la identidad (solo `total`). Sin `clienteId` en el cuerpo.
//
// Fallos que NO se colapsan: `sin_puente` (faltan envs) ≠ `error` (no ha salido: reintentar). Ninguno se le enseña a la
// persona como «pedido».
import { PORTAL_PUENTE_TIEMPO_MS } from '../puente-config.ts'

const RUTA = '/api/portal/patrimonio/pedir-precio'

export type TipoPedirPrecio = 'inmueble_sin_seguro' | 'seguro_no_vigente' | 'comunidad'

export type ResultadoPuentePedirPrecio =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'no_encontrado' }
  /** asegura dice que el inmueble tiene un seguro en vigor (o no lo puede saber): no se abre petición. */
  | { estado: 'no_aplica' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Interpreta la respuesta del GET de peticiones abiertas. PURA. Cualquier cosa que no sea un 200 `ok` con la lista bien
 * formada es `null` = «no hemos podido comprobarlo» (jamás una lista vacía: eso diría «no hay petición»).
 */
export function interpretarPeticionesAbiertas(status: number, j: unknown): { inmuebleId: string; pedidoEl: string }[] | null {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.peticiones)) return null
  const out: { inmuebleId: string; pedidoEl: string }[] = []
  for (const f of o.peticiones) {
    const r = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>
    if (typeof r.inmuebleId !== 'string' || !UUID.test(r.inmuebleId) || typeof r.pedidoEl !== 'string' || !FECHA.test(r.pedidoEl)) return null
    out.push({ inmuebleId: r.inmuebleId, pedidoEl: r.pedidoEl })
  }
  return out
}

/** Peticiones «Pedir precio» abiertas de esta identidad. `null` = sin puente, corte o respuesta rara (no se afirma nada). */
export async function peticionesPedirPrecioPorPuente(identidadId: string): Promise<{ inmuebleId: string; pedidoEl: string }[] | null> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}${RUTA}?identidadId=${encodeURIComponent(identidadId)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: control.signal,
    })
    return interpretarPeticionesAbiertas(res.status, await res.json().catch(() => null))
  } catch (e) {
    console.error('[portal/pedir-precio] no se pudieron leer las peticiones abiertas:', e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'red')
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function pedirPrecioPorPuente(x: { identidadId: string; inmuebleId: string; tipo: TipoPedirPrecio }): Promise<ResultadoPuentePedirPrecio> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return { estado: 'sin_puente' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}${RUTA}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ identidadId: x.identidadId, inmuebleId: x.inmuebleId, tipo: x.tipo }),
      cache: 'no-store',
      signal: control.signal,
    })
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const estado = typeof j?.estado === 'string' ? j.estado : null
    if (res.status === 200 && estado === 'ok' && typeof j?.pedidoEl === 'string') {
      return { estado: 'ok', pedidoEl: j.pedidoEl, yaExistia: j.yaExistia === true }
    }
    if (estado === 'no_encontrado') return { estado: 'no_encontrado' }
    if (estado === 'no_aplica') return { estado: 'no_aplica' }
    if (estado === 'sin_configurar') return { estado: 'sin_puente' }
    console.error(`[portal/pedir-precio] respuesta inesperada del puente: ${res.status} ${estado ?? 'sin estado'}`)
    return { estado: 'error', causa: `puente_${res.status}` }
  } catch (e) {
    const abortado = e instanceof Error && e.name === 'AbortError'
    // Sin cuerpo ni ids en el log: solo cómo ha fallado.
    console.error('[portal/pedir-precio] el puente no respondió:', abortado ? 'timeout' : 'red')
    return { estado: 'error', causa: abortado ? 'timeout' : 'red' }
  } finally {
    clearTimeout(reloj)
  }
}
