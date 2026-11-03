// lib/sivra/pricing-suelo-finde.ts — SUELO de fin de semana cuando la fecha NO tiene mercado medido.
//
// POR QUÉ (27/09/2026, reserva de House Sevillana 29-31/01/2027 por 600€). El finde solo se
// encarecía por el ancla de la FECHA exacta (`pricing-ancla-fecha.ts`), que exige ≥5 comps fiables
// de ESE día. Sin ellos —lo normal a 4 meses vista y en pisos de 12 plazas, donde el conector barre
// pocas fechas— el viernes y el sábado se tarifican con el bucket del MES, igual que un martes, y
// caen al mismo `min_price`. Medido: el motor tenía 436/456€ el 19/09, el raíl los bajó a 349/365€
// y a 300/300€ (el suelo) en dos pasadas, y se vendieron a 300€/noche en 6 días. Todo enero estaba
// a 300€: el finde no valía más que un martes.
//
// Factor 1,15: en `market_rates` (booking_mcp, 3.553 filas de 10+ plazas) la mediana de noche de
// viernes/sábado es 1,26× la de entre semana; contra la mediana del MES —que ya mezcla findes— sale
// ~1,17×. Se toma el lado conservador.
//
// Deliberadamente estrecho:
//   · solo noches de VIERNES y SÁBADO (la noche que empieza ese día);
//   · solo si la fecha NO tiene ancla de mercado medida: con mercado medido manda él (ancla y techo);
//   · no en noches de evento: tienen su propio suelo estacional y su salto;
//   · es un SUELO sobre `min_price`, no un multiplicador del objetivo: nunca baja nada, y lo que
//     viene detrás (max_price, techo de mercado medido, techo por ADR) sigue mandando.
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

export const FACTOR_SUELO_FINDE = 1.15

/** Noche de viernes o sábado. `fecha` = 'YYYY-MM-DD' (la noche que empieza ese día). */
export function esNocheFinde(fecha: string): boolean {
  const d = new Date(fecha + "T00:00:00Z").getUTCDay()
  return d === 5 || d === 6
}

export type SueloFindeInput = {
  fecha: string
  minPrice: number | null
  /** true si el ancla de mercado de la FECHA exacta disparó (hay mercado medido de ese día) */
  fechaMedida: boolean
  /** factor de evento de la fecha (1 = día normal) */
  factorEvento: number
}

/** Suelo del finde en base (sin markup), o `null` si no aplica. */
export function sueloFinde(i: SueloFindeInput, factor = FACTOR_SUELO_FINDE): number | null {
  if (i.minPrice == null || !(i.minPrice > 0)) return null
  if (i.fechaMedida) return null
  if (i.factorEvento > 1) return null
  if (!esNocheFinde(i.fecha)) return null
  return Math.round(i.minPrice * factor)
}

// ─── Suelo de fin de semana FIJADO por el propietario (`pricing_settings.min_price_finde`) ───────
//
// POR QUÉ (27/10/2026, House Sevillana 30/04-02/05/2027 vendida en Booking por 1.346,70€ bruto →
// 1.081,13€ neto de portal → 486€/noche tras la limpieza). El motor la había bajado de 608 a 576 de
// base el día antes. Con un 19,7% de comisión de Booking y 108,90€ de limpieza por salida, una
// base que parece holgada deja poco: el suelo de arriba (min_price × 1,15 = 345) no protege nada.
//
// Distinto de `sueloFinde`: aquel es un factor sobre min_price y SOLO sin mercado medido ni evento;
// este es un número que pone el propietario y vale SIEMPRE en noches vie/sáb — con mercado medido,
// con evento y por encima de los techos de mercado/ADR —. Solo `max_price` (el techo del propietario)
// le gana. NULL o ≤0 = sin efecto (comportamiento idéntico al de antes de la columna).
//
// Como `min_price`, se aplica DESPUÉS del raíl ±max_change_pct: una fecha por debajo del suelo
// sube a él de golpe (el raíl frena el ruido del mercado, no una regla de negocio del dueño).

/** Suelo vie/sáb del propietario en base (sin markup), o `null` si no aplica. */
export function sueloFindePropietario(i: {
  fecha: string
  minPriceFinde: number | null
  maxPrice: number | null
}): number | null {
  if (i.minPriceFinde == null || !(i.minPriceFinde > 0)) return null
  if (!esNocheFinde(i.fecha)) return null
  return i.maxPrice != null ? Math.min(i.minPriceFinde, i.maxPrice) : i.minPriceFinde
}
