// ────────────────────────────────────────────────────────────────────────────
// ¿Merece AVISO una bajada de precio? PURO.
//
// Alberto (24/09/2026): «importante avisos de BUENAS bajadas». Hasta hoy
// `avisarBajadas` avisaba de cualquier bajada de una casa, y el conector de
// Idealista trae bajadas del 1% (670.000€ → 660.000€ en Santa Cruz, medido
// ese día): con eso el aviso bueno se ahoga entre ruido.
//
// Buena = la ÚLTIMA bajada es de al menos un 5%, o lo acumulado desde el precio
// de salida llega al 10% en dos bajadas o más (vendedor que baja y vuelve a
// bajar = nervioso, aunque cada paso sea pequeño). Lo que no llega se queda
// PENDIENTE sin marcar: si vuelve a bajar, se reevalúa con lo acumulado.
// ────────────────────────────────────────────────────────────────────────────

/** % mínimo de la última bajada para avisar. */
export const BAJADA_BUENA_PCT = 5
/** % acumulado desde el precio de salida (con ≥2 bajadas) para avisar. */
export const BAJADA_BUENA_ACUMULADA_PCT = 10

export interface DatosBajada {
  precio: number
  /** Precio justo antes de la última bajada. `null` = no se conoce. */
  anterior: number | null
  /** Primer precio conocido del anuncio. */
  inicial: number | null
  /** Nº de bajadas observadas. */
  bajadas: number
}

function pct(desde: number | null, hasta: number): number | null {
  if (desde == null || !(desde > 0) || !(hasta > 0) || hasta >= desde) return null
  return (1 - hasta / desde) * 100
}

/** % de la última bajada (`null` si no hay precio anterior mayor). */
export function pctUltimaBajada(d: DatosBajada): number | null {
  return pct(d.anterior, d.precio)
}

/** % acumulado desde el precio de salida (`null` si no ha bajado). */
export function pctBajadaAcumulada(d: DatosBajada): number | null {
  return pct(d.inicial, d.precio)
}

export function esBuenaBajada(d: DatosBajada): boolean {
  const ultima = pctUltimaBajada(d)
  if (ultima != null && ultima >= BAJADA_BUENA_PCT) return true
  const acumulada = pctBajadaAcumulada(d)
  return d.bajadas >= 2 && acumulada != null && acumulada >= BAJADA_BUENA_ACUMULADA_PCT
}
