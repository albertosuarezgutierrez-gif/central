// lib/sivra/pricing-techo-mercado.ts — el TECHO de mercado medido: no listar al huésped a ×3-×5.
//
// POR QUÉ (25/08/2026). El motor tiene varios caminos que SUBEN el precio saltándose el raíl
// ±%/día a propósito (salto de evento, suelo PL, premio de mercado) y varias guardas que impiden
// BAJARLO (outlier +40% a >30 días, congelación Karol G, evento a ciegas). Ninguna de las dos
// familias miraba lo único que de verdad acota por arriba: **lo que el mercado de ESA fecha cobra,
// medido con corpus fiable**. Resultado, medido ese día en el corpus vivo: 238 fechas listadas a
// más de 1,5× la mediana FIABLE de su propia fecha, 55 de ellas a más de ×3 — Duplex 29/09 a 460€
// de huésped contra 138-175€ de mercado (un partido con factor 2,2 multiplicó la base GLOBAL por
// encima del día medido), Busto Reform 17/01/27 a 496€ contra 94€ (inflado en la era Serper), y la
// guarda de outlier los mantenía ahí congelados hasta 30 días antes del check-in — cuando ya no
// queda a quién vendérselos.
//
// La regla, en una frase: **si el mercado de la fecha está MEDIDO, nuestro precio de huésped no
// puede superar `ratio ×` esa mediana — y una congelación no puede retener un precio por encima de
// ese techo.** Dos escalones, del más fiable al más laxo:
//
//   · FECHA exacta (≥5 comps fiables, el mismo listón que `pricing-ancla-fecha`): ratio 1,5. Es
//     generoso a propósito — el ancla de la fecha ya empuja hacia la mediana; el techo solo caza
//     lo absurdo, no afina el precio.
//   · MES (bucket fiable ya elegible) y SOLO si la fecha NO tiene evento conocido: ratio 2,5. Un
//     puente o un sábado especial pueden ir a 1,5-2× su mes; ×2,5 sin evento ya no es una noche
//     premium, es un precio fósil. Con evento el mes NO acota nada (la Feria va a 3-5× su abril):
//     ahí solo la medición de la propia fecha tiene autoridad.
//
// El techo BAJA respetando los raíles de siempre: nunca por debajo del suelo del raíl del día
// (`ancla × (1 − max_change_pct)`) ni del `min_price` del propietario — un precio ×4 se deshace en
// 3-4 pasadas, no de golpe. Y como el techo sale del corpus VIVO, si el mercado sube (el evento se
// acerca, la rutina mide más caro), el techo sube con él.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

import type { OrigenBucket } from "./pricing-bucket-fuente"
import { baseDesdeGuestConFijo } from "./pricing-canal.ts"

/** Sobre la mediana FIABLE de la fecha exacta. Generoso: caza lo absurdo, no afina. */
export const TECHO_FECHA_RATIO = 1.5
/** Sobre el bucket fiable del MES, solo sin evento conocido: un puente cabe, un fósil no. */
export const TECHO_MES_RATIO = 2.5
/** Comps fiables mínimos de la fecha (el mismo listón que `anclaMercadoFecha`). */
export const TECHO_MIN_COMPS_FECHA = 5
/** Con factor de evento ≥ esto, el escalón del MES se inhibe (espejo de FACTOR_EVENTO_EXCLUIR). */
export const TECHO_EVENTO_INHIBE_MES = 1.15

export type TechoMercadoInput = {
  /** mediana GUEST del bucket de la FECHA exacta (`elegirBucket`); null/0 = sin bucket */
  medFechaGuest?: number | null
  compsFecha?: number
  fuenteFecha?: OrigenBucket | null
  /** mediana GUEST del bucket del MES, SOLO si ya es elegible (n y fechas mínimas cumplidas) */
  medMesGuest?: number | null
  fuenteMes?: OrigenBucket | null
  /** factor de evento efectivo del día (calendario + tabla). 1 = sin evento */
  factorEvento: number
  /** multiplicador del canal (`escaparate = markup × base + cuota fija`) */
  markup: number
  /** cuota fija del canal repartida por noche (0 solo si se ha MIRADO que no hay) */
  fijoNoche: number
  /** ajuste demanda/calidad del motor para ESTE día (el mismo que infla el objetivo) */
  dqFactor: number
}

export type TechoMercadoOpts = {
  ratioFecha?: number
  ratioMes?: number
  minCompsFecha?: number
  eventoInhibeMes?: number
}

export type TechoMercado = {
  /** precio BASE máximo que el mercado medido justifica. 0 = sin evidencia suficiente: SIN techo. */
  techo: number
  origen: "fecha" | "mes" | null
}

/**
 * Techo de precio BASE que el mercado MEDIDO justifica para un día. `techo: 0` significa «no hay
 * con qué acotar» (sin corpus fiable, o fecha de evento sin medición propia) — nunca «techo cero».
 */
export function techoMercado(i: TechoMercadoInput, o: TechoMercadoOpts = {}): TechoMercado {
  const ratioFecha = o.ratioFecha ?? TECHO_FECHA_RATIO
  const ratioMes = o.ratioMes ?? TECHO_MES_RATIO
  const minComps = o.minCompsFecha ?? TECHO_MIN_COMPS_FECHA
  const inhibe = o.eventoInhibeMes ?? TECHO_EVENTO_INHIBE_MES

  if (!(i.markup > 0) || !(i.dqFactor > 0)) return { techo: 0, origen: null }
  const fijo = Number(i.fijoNoche) > 0 ? Number(i.fijoNoche) : 0

  // Escalón 1: la propia fecha, medida con corpus fiable y muestra suficiente.
  if (
    i.fuenteFecha === "fiable" &&
    Number(i.compsFecha) >= minComps &&
    Number(i.medFechaGuest) > 0
  ) {
    return {
      techo: baseDesdeGuestConFijo(Number(i.medFechaGuest) * i.dqFactor * ratioFecha, i.markup, fijo),
      origen: "fecha",
    }
  }

  // Escalón 2: el mes fiable, SOLO sin evento conocido — la autoridad sobre una noche de evento
  // la tiene su propia medición, nunca el promedio del mes (la Feria vale 3-5× su abril).
  if (
    i.fuenteMes === "fiable" &&
    Number(i.medMesGuest) > 0 &&
    Number(i.factorEvento) < inhibe
  ) {
    return {
      techo: baseDesdeGuestConFijo(Number(i.medMesGuest) * i.dqFactor * ratioMes, i.markup, fijo),
      origen: "mes",
    }
  }

  return { techo: 0, origen: null }
}

export type AcoteTecho = {
  /** objetivo final tras aplicar el techo (y sus suelos: raíl del día y min_price) */
  target: number
  /** true = el techo ha recortado el objetivo de esta pasada */
  acotado: boolean
  /**
   * true = el precio VIVO está por encima del techo: las guardas de congelación (outlier, Karol G)
   * NO pueden retenerlo. Es la mitad que deshace el daño: sin ella, el techo acotaría el objetivo
   * pero el `continue` de la guarda dejaría el precio inflado donde está, para siempre.
   */
  liberaCongelacion: boolean
}

/**
 * Aplica el techo al objetivo del día. El descenso respeta los suelos de siempre: nunca por debajo
 * del suelo del raíl (±%/día sobre el ancla — un ×4 se deshace en varias pasadas, no de golpe) ni
 * del `min_price` del propietario.
 */
export function acotarPorTecho(p: {
  target: number
  techo: number
  /** precio vivo de la fecha; null = fecha sin precio (sin congelación que liberar) */
  old: number | null
  /** suelo del raíl del día (`ancla × (1 − max_change_pct)`); null = sin raíl (fecha nueva) */
  railLo: number | null
  minPrice: number | null
}): AcoteTecho {
  if (!(p.techo > 0)) return { target: p.target, acotado: false, liberaCongelacion: false }
  let objetivo = Math.min(p.target, p.techo)
  if (p.railLo != null) objetivo = Math.max(objetivo, p.railLo)
  if (p.minPrice != null) objetivo = Math.max(objetivo, p.minPrice)
  return {
    target: objetivo,
    acotado: objetivo < p.target,
    liberaCongelacion: p.old != null && p.old > p.techo,
  }
}
