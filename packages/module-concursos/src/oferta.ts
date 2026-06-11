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
