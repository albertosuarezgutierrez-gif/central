// lib/sivra/pricing-suelo-pl.ts — el suelo PriceLabs cede ante el mercado MEDIDO de la fecha.
//
// POR QUÉ (15/08/2026). La referencia PL (`pricing_pl_referencia`) es una foto ESTÁTICA del pasado
// que actúa de suelo (PL_FLOOR_RATIO×PL) hasta caducar. Ese día se descubrió que la foto congelada
// por el PR #1416 era en realidad un eco del propio motor: la migración de congelación re-etiquetó
// `captured_at='2026-08-10'` pero NO restauró los precios, así que las filas re-capturadas el
// 11-14/08 (ya sin PL) conservaron los picos del sawtooth del motor. Resultado: la noche del 15/08
// un piso de 2 plazas pedía 359€ con la mediana fiable de SU fecha medida en 77€ — el suelo
// contaminado retenía el precio y el raíl −20%/día no podía deshacerlo (cada bajada re-anclaba en
// el suelo del día siguiente).
//
// La reconstrucción de la tabla (migración 2026-08-15) arregla los DATOS; esta guarda arregla la
// CLASE de fallo: ninguna referencia estática puede retener un precio muy por encima de lo que el
// mercado fiable de ESA fecha exacta dice. Si la fecha tiene ancla fiable (`anclaMercadoFecha` > 0:
// conector, ≥5 comps de su escenario, ya en precio BASE), el suelo PL se acota a `ancla × margen`.
// Una noche especial DE VERDAD no se pierde: o sus comps medidos también son caros (el cap queda
// alto), o no hay comps fiables de la fecha y el suelo sigue intacto — que es exactamente el punto
// ciego (Pilar, Todos los Santos) para el que el suelo se diseñó.
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

export type SueloPLInput = {
  /** último precio PriceLabs conocido de la fecha (pricing_pl_referencia.pl_price) */
  plRef: number
  /** fracción del precio PL por debajo de la cual el motor no escribe (PL_FLOOR_RATIO) */
  ratio: number
  /** `anclaMercadoFecha()` del día en precio BASE; 0 = sin evidencia fiable de la fecha */
  anclaFecha: number
  /** holgura del suelo sobre el ancla de mercado (default 1.2) */
  margen?: number
}

export type SueloPLResult = {
  /** suelo efectivo a aplicar (`target = max(target, floor)` aguas abajo, con el techo del dueño) */
  floor: number
  /** true si el mercado de la fecha acotó el suelo (señal de referencia PL desfasada o corrupta) */
  acotado: boolean
}

export function acotarSueloPL(i: SueloPLInput): SueloPLResult {
  const base = Math.round(i.plRef * i.ratio)
  if (!(i.anclaFecha > 0)) return { floor: base, acotado: false }
  const cap = Math.round(i.anclaFecha * (i.margen ?? 1.2))
  return cap < base ? { floor: cap, acotado: true } : { floor: base, acotado: false }
}
