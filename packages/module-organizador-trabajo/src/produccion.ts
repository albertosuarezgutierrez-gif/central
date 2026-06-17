/** Una línea de producción: cuántas unidades y el tiempo estimado por unidad. */
export interface LineaProduccion {
  cantidad: number
  minutos_por_unidad: number
}

/**
 * Minutos totales de trabajo de una producción: Σ(cantidad × minutos_por_unidad).
 * El "100 croquetas son tantas horas" de la reunión.
 */
export function estimarMinutosProduccion(lineas: LineaProduccion[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad * l.minutos_por_unidad, 0)
}

/**
 * Cuántas personas hacen falta para sacar `minutosTotales` dentro de una jornada
 * de `minutosPorPersona`. Redondea hacia arriba (no hay medias personas).
 * Devuelve 0 si no hay trabajo o la jornada no es válida.
 */
export function personasNecesarias(minutosTotales: number, minutosPorPersona: number): number {
  if (minutosTotales <= 0 || minutosPorPersona <= 0) return 0
  return Math.ceil(minutosTotales / minutosPorPersona)
}
