// ────────────────────────────────────────────────────────────────────────────
// Scoring — PURO. Cálculos deterministas sobre los importes de la ficha:
// garantías, umbral de baja temeraria (RGLCAP art. 85, supletorio del pliego)
// y puntuación del criterio económico.
// ────────────────────────────────────────────────────────────────────────────

import type { FichaConcurso } from './types'

/** Redondea a 2 decimales (igual que SQL ROUND(x, 2)). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface GarantiasCalculadas {
  provisional?: number   // € (sobre presupuesto base)
  definitiva?: number    // € (sobre importe de adjudicación, o presupuesto si no hay)
}

/**
 * Importe en euros de las garantías. La definitiva por defecto es el 5 % del
 * importe de adjudicación (art. 107 LCSP); si no hay adjudicación todavía, se
 * estima sobre el presupuesto base. La provisional sólo si el pliego la exige.
 */
export function calcularGarantias(
  ficha: FichaConcurso,
  importeAdjudicacion?: number,
): GarantiasCalculadas {
  const out: GarantiasCalculadas = {}
  const base = ficha.presupuesto_base
  if (base !== undefined && ficha.garantias.provisional_pct) {
    out.provisional = round2(base * ficha.garantias.provisional_pct / 100)
  }
  const baseDef = importeAdjudicacion ?? base
  if (baseDef !== undefined) {
    const pct = ficha.garantias.definitiva_pct ?? 5
    out.definitiva = round2(baseDef * pct / 100)
  }
  return out
}

export interface BajaTemeraria {
  umbral: number | null   // € por debajo del cual la oferta es presuntamente anormal
  metodo: string          // explicación del criterio aplicado
}

/**
 * Umbral de baja temeraria (oferta anormalmente baja) según el RGLCAP art. 85,
 * que se aplica de forma SUPLETORIA cuando el pliego no fija su propia fórmula.
 * Devuelve el importe por debajo del cual una oferta debe justificarse.
 *
 * @param ofertas importes ofertados por los licitadores (€, ya conocidos)
 * @param presupuestoBase necesario sólo para el caso de un único licitador
 */
export function umbralBajaTemeraria(ofertas: number[], presupuestoBase?: number): BajaTemeraria {
  const xs = ofertas.filter(n => Number.isFinite(n) && n > 0)
  const n = xs.length

  if (n === 0) {
    return { umbral: null, metodo: 'Sin ofertas para calcular el umbral' }
  }
  if (n === 1) {
    if (presupuestoBase === undefined) {
      return { umbral: null, metodo: '1 licitador: se necesita el presupuesto base (umbral = presupuesto − 25 %)' }
    }
    return { umbral: round2(presupuestoBase * 0.75), metodo: '1 licitador: 25 % por debajo del presupuesto base' }
  }
  if (n === 2) {
    // Temeraria la que sea > 20 % inferior a la otra.
    const max = Math.max(...xs)
    return { umbral: round2(max * 0.8), metodo: '2 licitadores: 20 % por debajo de la otra oferta' }
  }

  // 3+ licitadores: media de las ofertas; se descartan del cálculo de la media
  // las que superen la media en más de 10 unidades porcentuales (art. 85.4).
  const media0 = xs.reduce((s, x) => s + x, 0) / n
  const filtradas = xs.filter(x => x <= media0 * 1.1)
  const base = filtradas.length ? filtradas : xs
  const media = base.reduce((s, x) => s + x, 0) / base.length
  return { umbral: round2(media * 0.9), metodo: '3+ licitadores: 10 % por debajo de la media (descartando ofertas > media + 10 %)' }
}

export type FormulaEconomica = 'proporcional_inversa' | 'lineal_baja'

/**
 * Puntuación del criterio económico de una oferta.
 * · proporcional_inversa: puntos · (ofertaMin / oferta)  (premia la más barata)
 * · lineal_baja: puntos · (presupuesto − oferta) / (presupuesto − ofertaMin)
 *   (reparte linealmente entre el presupuesto y la oferta más baja)
 *
 * @returns puntos (0..puntosMax), redondeado a 2 decimales
 */
export function calcularPuntuacionEconomica(
  oferta: number,
  ofertas: number[],
  puntosMax: number,
  opts: { formula?: FormulaEconomica; presupuestoBase?: number } = {},
): number {
  const xs = ofertas.filter(n => Number.isFinite(n) && n > 0)
  if (!Number.isFinite(oferta) || oferta <= 0 || xs.length === 0) return 0
  const min = Math.min(...xs)
  const formula = opts.formula ?? 'proporcional_inversa'

  if (formula === 'lineal_baja') {
    const pb = opts.presupuestoBase
    if (pb === undefined || pb <= min) return round2(oferta <= min ? puntosMax : 0)
    const p = puntosMax * (pb - oferta) / (pb - min)
    return round2(Math.max(0, Math.min(puntosMax, p)))
  }

  // proporcional_inversa
  return round2(Math.max(0, Math.min(puntosMax, puntosMax * (min / oferta))))
}

/** Suma de puntos máximos de todos los criterios (para validar que sumen 100). */
export function totalPuntos(ficha: FichaConcurso): number {
  return round2(ficha.criterios.reduce((s, c) => s + (c.puntos || 0), 0))
}
