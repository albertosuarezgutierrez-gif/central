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

/** Carga de producción de un día (suma de los minutos de los eventos de esa fecha). */
export interface CargaDia {
  fecha: string                // 'YYYY-MM-DD'
  minutos: number
  personas: number             // personas necesarias ese día para la jornada dada
}

/**
 * Previsión de personal "a semana vista": agrupa los eventos por fecha, suma sus
 * minutos de producción y calcula cuántas personas hacen falta cada día. Días
 * ordenados ascendente. Avisa con antelación de los picos (lo que Carmen no ve).
 */
export function personalPorDia(
  eventos: { fecha: string; minutos: number }[],
  minutosPorPersona: number,
): CargaDia[] {
  const porDia = new Map<string, number>()
  for (const ev of eventos) {
    porDia.set(ev.fecha, (porDia.get(ev.fecha) ?? 0) + ev.minutos)
  }
  return [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([fecha, minutos]) => ({ fecha, minutos, personas: personasNecesarias(minutos, minutosPorPersona) }))
}
