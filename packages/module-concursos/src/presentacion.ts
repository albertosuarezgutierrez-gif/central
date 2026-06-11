// ────────────────────────────────────────────────────────────────────────────
// Presentación + plazos/subsanación (F6) — PURO. Aritmética de fechas ISO en
// UTC (días naturales del pliego), estado de presentación y subsanación en
// días hábiles. Determinista.
// ────────────────────────────────────────────────────────────────────────────

import type {
  EstadoPresentacion,
  FichaConcurso,
  PlazoSubsanacion,
  SobresListos,
} from './types'

const MS_DIA = 86_400_000

/** Parsea 'YYYY-MM-DD' a epoch UTC de medianoche (NaN si no es válida). */
function epoch(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** ISO 'YYYY-MM-DD' de un epoch UTC. */
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Días naturales entre dos fechas ISO (hasta − desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((epoch(hasta) - epoch(desde)) / MS_DIA)
}

/**
 * Suma `dias` días HÁBILES (lun–vie) a una fecha ISO, saltando fines de semana.
 * No considera festivos (el pliego/órgano los precisa caso a caso).
 */
export function sumarDiasHabiles(desde: string, dias: number): string {
  let ms = epoch(desde)
  let restantes = dias
  while (restantes > 0) {
    ms += MS_DIA
    const dow = new Date(ms).getUTCDay() // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) restantes--
  }
  return iso(ms)
}
