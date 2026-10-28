// lib/sivra/pricing-suelo-fecha.ts — SUELO del propietario por piso y FECHA (`pricing_suelos_fecha`).
//
// POR QUÉ (28/10/2026, Alberto). Semana Santa y Feria 2027 en Duplex: el dueño sabe lo que valen
// esas noches antes que el mercado medido (a 5 meses vista el conector apenas barre esas fechas) y
// quiere un mínimo por noche que ningún techo derivado del mercado pueda perforar. Es el hermano de
// `sueloFindePropietario` (`pricing-suelo-finde.ts`) con una fecha concreta en vez de vie/sáb, y
// tiene EXACTAMENTE su semántica:
//   · en BASE (sin channel_markup ni cuota_fija), como `min_price`;
//   · se aplica DESPUÉS de primas, raíl y techos de mercado/ADR: una noche por debajo sube de golpe
//     (el raíl ±max_change_pct frena el ruido del mercado, no una regla de negocio del dueño);
//   · solo `max_price` (el techo del propietario) le gana;
//   · anula la banda muerta del 3 %: un precio vivo bajo el suelo se corrige siempre;
//   · si coincide con el suelo vie/sáb, manda el MAYOR (`sueloPropietario`).
//
// Tolerante a propósito: si la tabla no existe todavía (código desplegado antes que
// `prisma/sql/2026-10-28_pricing_suelo_fecha.sql`) o la lectura cae, el mapa llega `null` y no hay
// efecto — pero la ruta lo DECLARA como lectura caída (`suelos_fecha` en `pricing-lecturas.ts`):
// un suelo que el dueño puso y que no se aplica no puede pasar en silencio.
//
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

/** Lectura de la tabla. `fecha` en 'YYYY-MM-DD' (la noche que empieza ese día). */
export const SQL_SUELOS_FECHA =
  "SELECT property_id, fecha::text AS fecha, suelo_base::int AS suelo_base " +
  "FROM pricing_suelos_fecha WHERE fecha >= CURRENT_DATE"

export type FilaSueloFecha = { property_id: string; fecha: string; suelo_base: number | string | null }

const clave = (propertyId: string, fecha: string) => `${propertyId}|${fecha}`

/**
 * Indexa las filas por `piso|fecha`. Descarta lo que no es un suelo utilizable (≤0, no numérico,
 * fecha mal formada): una fila basura no puede subir un precio. El CHECK de la tabla ya lo impide;
 * esto es la segunda llave por si la tabla cambia.
 */
export function indexarSuelosFecha(filas: FilaSueloFecha[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of filas) {
    const v = Number(f.suelo_base)
    if (!Number.isFinite(v) || !(v > 0)) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.fecha))) continue
    const k = clave(String(f.property_id), String(f.fecha))
    // PK (property_id, fecha): no debería haber dos. Si las hubiera, el mayor (conservador).
    m.set(k, Math.max(m.get(k) ?? 0, Math.round(v)))
  }
  return m
}

/** Suelo por fecha del propietario en base, o `null` si no aplica. `suelos` null = no se pudo leer. */
export function sueloFechaPropietario(i: {
  propertyId: string
  fecha: string
  suelos: Map<string, number> | null
  maxPrice: number | null
}): number | null {
  if (i.suelos == null) return null
  const s = i.suelos.get(clave(i.propertyId, i.fecha))
  if (s == null || !(s > 0)) return null
  return i.maxPrice != null ? Math.min(s, i.maxPrice) : s
}

/** Suelo del propietario que manda en la noche: el MAYOR de los que apliquen, o `null`. */
export function sueloPropietario(finde: number | null, fecha: number | null): number | null {
  if (finde == null) return fecha
  if (fecha == null) return finde
  return Math.max(finde, fecha)
}
