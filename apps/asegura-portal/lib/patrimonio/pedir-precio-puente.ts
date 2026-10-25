// PATRIMONIO (24/10/2026, P14) — el PUENTE de «Pedir precio» a `apps/asegura` (`/api/portal/patrimonio/pedir-precio`), a
// imagen de `inquilinos-puente.ts`. NO es `lead-declarada.ts` (que modela pólizas aportadas con vencimiento).
//
// El portal NO escribe en `oportunidades` (es del lado de la correduría y su rol no lo toca): manda `identidadId` +
// `inmuebleId` + `tipo` y recibe solo el desenlace. asegura NO se fía de este lado: no recibe ficha ni titular, la saca
// del inmueble y recalcula el nivel de la identidad (solo `total`). Sin `clienteId` en el cuerpo.
//
// Fallos que NO se colapsan: `sin_puente` (faltan envs) ≠ `error` (no ha salido: reintentar). Ninguno se le enseña a la
// persona como «pedido».
import { PORTAL_PUENTE_TIEMPO_MS } from '../puente-config'

const RUTA = '/api/portal/patrimonio/pedir-precio'

export type TipoPedirPrecio = 'inmueble_sin_seguro' | 'seguro_no_vigente'

export type ResultadoPuentePedirPrecio =
  | { estado: 'ok'; pedidoEl: string; yaExistia: boolean }
  | { estado: 'no_encontrado' }
  /** asegura dice que el inmueble tiene un seguro en vigor (o no lo puede saber): no se abre petición. */
  | { estado: 'no_aplica' }
  | { estado: 'sin_puente' }
  | { estado: 'error'; causa: string }

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
