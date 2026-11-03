// «El inquilino PIDE precio» (27/10/2026) — el PUENTE a `apps/asegura` (`/api/portal/patrimonio/inquilino-precio`), a imagen
// de `lib/patrimonio/pedir-precio-puente.ts`. El portal no tiene la clave de cifrado: el nombre y el contacto que escribe el
// inquilino se guardan (cifrados) en la cartera, no aquí; el portal no los persiste ni los loguea.
//
// 🚨 Lo que viaja: identidad de la COOKIE + qué pide + nombre + canal + contacto. NADA del contrato, del inmueble ni del
// propietario, y NUNCA el consentimiento comercial (ese se queda en el portal). Fallos que no se colapsan: `sin_puente`
// (faltan envs) ≠ `error` (no ha salido). Ninguno se le enseña a la persona como «pedido».
import { PORTAL_PUENTE_TIEMPO_MS } from '../puente-config.ts'
import type { ResultadoPuentePrecioInquilino, SolicitudPrecioInquilino } from './precio-inquilino.ts'

const RUTA = '/api/portal/patrimonio/inquilino-precio'
const FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Interpreta la respuesta del puente. PURA. */
export function interpretarPuentePrecioInquilino(status: number, j: unknown): ResultadoPuentePrecioInquilino {
  const o = (typeof j === 'object' && j !== null ? j : {}) as Record<string, unknown>
  if (status === 200 && o.estado === 'ok' && typeof o.pedidoEl === 'string' && FECHA.test(o.pedidoEl)) {
    return { estado: 'ok', pedidoEl: o.pedidoEl, yaExistia: o.yaExistia === true }
  }
  if (status === 422 && o.estado === 'invalido') return { estado: 'invalido', campo: typeof o.campo === 'string' ? o.campo : 'datos' }
  if (o.estado === 'sin_configurar') return { estado: 'sin_puente' }
  return { estado: 'error' }
}

export async function pedirPrecioInquilinoPorPuente(x: { identidadId: string } & SolicitudPrecioInquilino): Promise<ResultadoPuentePrecioInquilino> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return { estado: 'sin_puente' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}${RUTA}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      // Campo a campo: nada de `...x` (un campo nuevo no se cuela por el puente sin decidirlo).
      body: JSON.stringify({ identidadId: x.identidadId, que: x.que, nombre: x.nombre, canal: x.canal, contacto: x.contacto }),
      cache: 'no-store',
      signal: control.signal,
    })
    const r = interpretarPuentePrecioInquilino(res.status, await res.json().catch(() => null))
    if (r.estado === 'error') console.error(`[portal/inquilino-precio] respuesta inesperada del puente: ${res.status}`)
    return r
  } catch (e) {
    // Sin cuerpo ni ids en el log: solo cómo ha fallado.
    console.error('[portal/inquilino-precio] el puente no respondió:', e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'red')
    return { estado: 'error' }
  } finally {
    clearTimeout(reloj)
  }
}
