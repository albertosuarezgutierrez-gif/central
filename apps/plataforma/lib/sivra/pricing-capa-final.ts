// lib/sivra/pricing-capa-final.ts — QUÉ CAPA decidió el precio final de una noche del apply.
//
// POR QUÉ (03/11/2026): el motor compone prima vie/sáb, raíl, suelos y techos, y `pricing_applied`
// solo guardaba el resultado. Sin la capa no se puede atribuir el efecto de la prima ni de los
// suelos sin estimarlo. Esto SOLO anota: no cambia ningún precio.
//
// Vocabulario CERRADO (el cepo lo compara con la migración 2026-11-03_pricing_applied_capas.sql):
//   suelo_fecha      suelo del propietario por fecha (`pricing_suelos_fecha`) subió la noche
//   suelo_finde      suelo vie/sáb subió la noche (`min_price_finde`, o el automático min_price×1,15)
//   max_price        el techo del propietario fijó el precio
//   suelo_estacional el suelo estacional (min_price × temporada/evento) fijó el precio
//   min_price        el suelo de coste fijó el precio
//   techo            el techo de mercado medido o el de ADR recortó el objetivo
//   rail             el raíl de ±%/día acotó el objetivo
//   prima            la noche llevó prima vie/sáb por ritmo propio y nada más la acotó
//   mercado          nada de lo anterior: el objetivo que dio el mercado/ancla
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

export const CAPAS_FINAL = [
  "mercado", "prima", "suelo_finde", "suelo_fecha", "suelo_estacional",
  "techo", "rail", "max_price", "min_price",
] as const
export type CapaFinal = (typeof CAPAS_FINAL)[number]

export type CapaInput = {
  /** precio final escrito (base, sin markup) */
  precioFinal: number
  maxPrice: number | null
  minPrice: number | null
  /** suelo estacional del día (ya capado por max_price) o null si no hay */
  sueloEstacional: number | null
  /** el suelo del propietario (vie/sáb o fecha) SUBIÓ el objetivo en su paso */
  sueloPropietarioSubio: boolean
  /** de los dos suelos del propietario, el que manda (el mayor); `fecha` si empatan con ambos */
  sueloPropietarioOrigen: "finde" | "fecha" | null
  /** el suelo automático de finde (min_price × 1,15) subió el objetivo */
  sueloFindeAutoSubio: boolean
  /** el techo de mercado o el de ADR acotó el objetivo */
  techoActuo: boolean
  /** el raíl de ±%/día cambió el objetivo */
  railActuo: boolean
  /** factor de prima vie/sáb aplicado a la noche (1 o null = ninguno) */
  prima: number | null
}

/** Capa que decidió el precio. Prioridad: lo último que pudo tocar el número, hacia atrás. */
export function decidirCapaFinal(i: CapaInput): CapaFinal {
  // El suelo del propietario va el último del motor: si subió el objetivo, decidió él.
  if (i.sueloPropietarioSubio) return i.sueloPropietarioOrigen === "fecha" ? "suelo_fecha" : "suelo_finde"
  if (i.maxPrice != null && i.precioFinal === i.maxPrice) return "max_price"
  // Suelos de coste: el estacional (si es mayor que min_price) antes que el de coste.
  if (i.sueloEstacional != null && i.precioFinal === i.sueloEstacional
      && (i.minPrice == null || i.sueloEstacional > i.minPrice)) return "suelo_estacional"
  if (i.minPrice != null && i.precioFinal === i.minPrice) return "min_price"
  if (i.techoActuo) return "techo"
  if (i.sueloFindeAutoSubio) return "suelo_finde"
  if (i.railActuo) return "rail"
  if (i.prima != null && i.prima > 1) return "prima"
  return "mercado"
}
