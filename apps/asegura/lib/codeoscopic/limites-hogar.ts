// `POST /home/recommend-limits`: los capitales de continente y contenido que
// Codeoscopic recomienda para una vivienda. Es el único punto de la API que da
// un capital por defecto (`docs/CODEOSCOPIC-API-PORTAL.md` § Hogar), y la forma
// de no teclearlo a ojo cuando la ficha no lo trae.
//
// ─── Por qué es la CUARTA excepción del guardián de gasto ────────────────────
// Es un POST al vendor fuera de `cotizar()`. El portal no menciona créditos
// («gratis según el portal»), pero tampoco dice que lo sea, y devuelve un
// capital POR PRODUCTO: [Probable] tarifica por dentro con cada compañía. Así
// que se trata como el ReRate: su llamante la envuelve SIEMPRE en
// `conLibroDeEmision` (motivo `limites_hogar`, coste en env que arranca en 0 =
// «sin confirmar», tope propio). Lo vigila
// `test/regression-asegura-gasto-codeoscopic.test.ts`.
//
// Y a diferencia de los catálogos, **no se llama sola**: solo desde un botón.

import { peticion } from './cliente.ts'
import type { ConfigCodeoscopic } from './config.ts'

/** Un capital recomendado. Cada extremo es `null` si el vendor no lo trae. */
export type RangoCapital = { media: number | null; minimo: number | null; maximo: number | null }

export type LimitesRecomendados = {
  /** `null` = el vendor no ha recomendado continente (no «0 €»). */
  continente: RangoCapital | null
  contenido: RangoCapital | null
}

function positivo(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function rango(v: unknown): RangoCapital | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const r = { media: positivo(o.average), minimo: positivo(o.lowest), maximo: positivo(o.highest) }
  return r.media === null && r.minimo === null && r.maximo === null ? null : r
}

/** Lee la respuesta. Puro: lo que no reconoce queda a `null`, nunca a 0. */
export function leerLimitesRecomendados(raw: unknown): LimitesRecomendados {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return { continente: rango(o.buildingsLimit), contenido: rango(o.contentsLimit) }
}

/**
 * La llamada. Un solo intento; con el timeout LARGO porque el portal avisa de
 * que puede tardar más de un minuto. Se envuelve en `conLibroDeEmision` en el
 * llamante, nunca aquí: igual que `reRate()`.
 */
export async function recomendarLimitesHogar(
  config: ConfigCodeoscopic,
  cuerpo: Record<string, unknown>,
): Promise<{ limites: LimitesRecomendados; crudo: unknown }> {
  const crudo = await peticion(config, {
    metodo: 'POST',
    path: '/home/recommend-limits',
    cuerpo,
    timeoutMs: config.timeoutCotizacionMs,
  })
  return { limites: leerLimitesRecomendados(crudo), crudo }
}
