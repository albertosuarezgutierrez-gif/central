// ────────────────────────────────────────────────────────────────────────────
// Oferta económica + rentabilidad (F5) — PURO. Reutiliza scoring.ts (puntuación
// económica y baja temeraria). El coste lo aporta la app. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  CosteEjecucion,
  EvaluacionOferta,
  FichaConcurso,
} from './types'
import { round2, calcularPuntuacionEconomica, umbralBajaTemeraria } from './scoring.ts'

/** Coste total de ejecutar el contrato (directos + indirectos). */
export function costeTotal(coste: CosteEjecucion): number {
  return round2((coste.directos || 0) + (coste.indirectos || 0))
}

/**
 * Precio mínimo para ser rentable. Sin margen objetivo = coste (equilibrio).
 * Con margen objetivo m% SOBRE EL PRECIO: precio = coste / (1 − m/100). Si m>=100
 * (sin sentido), se devuelve el coste para no dividir por cero o negativo.
 */
export function precioMinimoRentable(coste: CosteEjecucion): number {
  const ct = costeTotal(coste)
  const m = coste.margen_objetivo_pct
  if (m === undefined || m <= 0 || m >= 100) return ct
  return round2(ct / (1 - m / 100))
}

/**
 * Evalúa una oferta. `opts.ofertas` son TODOS los importes en juego (incluida la
 * propia), si se conocen: sirven para los puntos económicos y la baja temeraria.
 * Sin competencia conocida se usa solo la propia oferta. Una oferta temeraria no
 * es viable aunque tenga margen (habría que justificarla).
 */
export function evaluarOferta(
  oferta: number,
  coste: CosteEjecucion,
  ficha: FichaConcurso,
  opts: { ofertas?: number[] } = {},
): EvaluacionOferta {
  const coste_total = costeTotal(coste)
  const margen_euros = round2(oferta - coste_total)
  const margen_pct = oferta > 0 ? round2((margen_euros / oferta) * 100) : 0

  const ofertas = opts.ofertas && opts.ofertas.length ? opts.ofertas : [oferta]

  const crit = ficha.criterios.find(c => c.sobre === 'economico' || (c.tipo === 'automatico' && c.sobre !== 'tecnico'))
  const puntos_economicos = crit
    ? calcularPuntuacionEconomica(oferta, ofertas, crit.puntos, { presupuestoBase: ficha.presupuesto_base })
    : 0

  const { umbral } = umbralBajaTemeraria(ofertas, ficha.presupuesto_base)
  const temeraria = umbral !== null && oferta < umbral

  const viable = margen_euros >= 0 && !temeraria

  return { oferta, coste_total, margen_euros, margen_pct, puntos_economicos, temeraria, umbral_temeraria: umbral, viable }
}
