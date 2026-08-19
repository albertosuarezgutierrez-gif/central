// lib/sivra/pricing-ancla-fecha.ts — el ancla SUAVE al mercado de la FECHA exacta (el finde visible).
//
// POR QUÉ (09/08/2026, auditoría tras la reserva de Luxury 16-18/10). El motor tarifica los días
// normales con el bucket del MES, que mezcla entre semana y findes: un sábado que el mercado vende a
// 258€ sale al precio del "octubre medio" (250€ menos ajustes). El «premio de mercado» de
// `pricing-premio-mercado.ts` no lo rescata a propósito — su umbral 1,5× está pensado para EVENTOS
// (Karol G, Feria), y un finde va a 1,1-1,4× su mes. Resultado medido: TRES reservas de Luxury
// vendidas un 36-43% por debajo del p50 de su fecha exacta (18/09, 06/11, 16-17/10) teniendo el
// motor 29-40 comparables de ESA fecha en la mano.
//
// Esta función es el hueco entre ambos: cuando la FECHA tiene mediana FIABLE (medida por el conector
// para ese día, no precio de anuncio de Serper) con muestra suficiente, la base del día es AL MENOS
// esa mediana (con el ajuste demanda/calidad del motor). Diferencias deliberadas con el premio:
//   · umbral de ratio NINGUNO (aplica también al finde corriente) pero muestra MÁS exigente (≥5
//     comps frente a 3): dispara a diario, así que pide más evidencia;
//   · solo corpus FIABLE — un ancla diaria alimentada por snippets de Serper fabricaría findes;
//   · solo SUBE y NO salta el raíl ±%/día (el premio de evento sí lo salta): el finde no es una
//     emergencia, puede escalar en 1-2 pasadas.
// Aguas abajo siguen mandando last-minute, gap, suelo, techo y raíl, como con cualquier objetivo.
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

import type { OrigenBucket } from "./pricing-bucket-fuente"
import { baseDesdeGuestConFijo } from "./pricing-canal.ts"

export type AnclaFechaInput = {
  /** mediana de mercado (precio GUEST) de la FECHA exacta, ya normalizada por aforo */
  medFechaGuest: number
  /** nº de comps (deduplicados) que forman esa mediana */
  comps: number
  /** procedencia del bucket de la fecha (`elegirBucket`): solo 'fiable' ancla */
  fuente: OrigenBucket
  /** multiplicador del canal (`escaparate = markup × base + cuota fija`) */
  markup: number
  /**
   * Parte FIJA que el canal suma a esta noche (la cuota por estancia repartida entre las noches de
   * la estancia típica del piso). Es obligatoria a propósito: cuando era implícitamente 0, el motor
   * pedía ~230€ de base de más en las noches caras de House. Un piso sin cuota medida pasa 0, pero
   * lo pasa MIRANDO — no por olvido.
   */
  fijoNoche: number
  /** ajuste demanda/calidad del motor para ESTE día */
  dqFactor: number
}

export type AnclaFechaOpts = {
  /** comps mínimos de la fecha para fiarnos de su mediana (más alto que el premio: dispara a diario) */
  minComps?: number
}

/**
 * Devuelve el precio BASE (sin markup) mínimo que justifica el mercado de ESA fecha, o 0 si no hay
 * evidencia suficiente. En el motor: `target = max(target, ancla)` ANTES del raíl ±%/día.
 */
export function anclaMercadoFecha(i: AnclaFechaInput, o: AnclaFechaOpts = {}): number {
  const minComps = o.minComps ?? 5
  if (i.fuente !== "fiable") return 0
  if (i.comps < minComps) return 0
  if (i.medFechaGuest <= 0 || i.markup <= 0 || !(i.dqFactor > 0)) return 0
  return baseDesdeGuestConFijo(i.medFechaGuest * i.dqFactor, i.markup, i.fijoNoche)
}
