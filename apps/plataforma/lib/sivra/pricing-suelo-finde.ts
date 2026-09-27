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
