// «Evolución de la prima» (14/10/2026): el detalle al que lleva el push de «subida de prima».
// Lógica PURA sobre lo que guarda `portal_prima_observada` (lo escribe `observarPrima`).
//
// Tres estados, sin inventar nada:
//   · `null`        → no hay observación de esta póliza (o no hay subida pendiente): no se pinta nada.
//   · `subida`      → hay una subida guardada: anterior → actual, % y fecha.
//   · cada importe puede ser `null` ("—"), jamás 0: una cifra ilegible o fuera de cota no se afirma.
// El % NO se fía del guardado a ciegas: se recalcula de anterior/actual (redondeo a 2 decimales) y,
// si no se puede, se cae al guardado solo si es finito; si tampoco, `null`.

export type FilaPrimaObservada = {
  importe: number | null
  unidad: string
  observadoEn: Date | null
  subidaDesde: number | null
  subidaHasta: number | null
  subidaPorcentaje: number | null
  subidaEn: Date | null
}

export type EvolucionPrima = {
  tipo: 'subida'
  /** Prima anterior en euros; `null` = no consta (se pinta «—»). */
  anterior: number | null
  /** Prima actual en euros; `null` = no consta. */
  actual: number | null
  /** % de subida con 2 decimales; `null` = no calculable. */
  porcentaje: number | null
  /** Cuándo se observó la subida; `null` = no consta. */
  en: Date | null
  /** Qué importe es (para rotularlo). */
  base: 'cartera' | 'aportada' | 'otra'
}

const positivo = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n > 0 ? n : null)

/** Qué clase de importe es, por el prefijo de `unidad` (`cartera-bruta-anual|…` / `declarada-anual|…`). */
export function baseDeUnidad(unidad: string): EvolucionPrima['base'] {
  if (unidad.startsWith('cartera')) return 'cartera'
  if (unidad.startsWith('declarada')) return 'aportada'
  return 'otra'
}

/** % entre dos importes, 2 decimales. `null` si el origen no es un importe positivo. */
export function porcentajeDeSubida(anterior: number | null, actual: number | null): number | null {
  const a = positivo(anterior)
  const n = positivo(actual)
  if (a === null || n === null) return null
  return Math.round(((n - a) / a) * 10000) / 100
}

/** `null` = nada que pintar (sin fila, o fila sin subida pendiente). */
export function evolucionDePrima(fila: FilaPrimaObservada | null): EvolucionPrima | null {
  if (fila === null) return null
  const tieneSubida = fila.subidaEn !== null || fila.subidaDesde !== null || fila.subidaHasta !== null
  if (!tieneSubida) return null
  const anterior = positivo(fila.subidaDesde)
  const actual = positivo(fila.subidaHasta)
  const calculado = porcentajeDeSubida(anterior, actual)
  const guardado = fila.subidaPorcentaje !== null && Number.isFinite(fila.subidaPorcentaje) ? Math.round(fila.subidaPorcentaje * 100) / 100 : null
  return {
    tipo: 'subida',
    anterior,
    actual,
    porcentaje: calculado ?? guardado,
    en: fila.subidaEn,
    base: baseDeUnidad(fila.unidad),
  }
}
