import type { PeriodicidadRecurrente, PlantillaRecurrente } from './types.ts'

/**
 * Genera las fechas de materialización de una plantilla recurrente entre
 * `fecha_inicio` y `min(hasta, fecha_fin)`, con paso según la periodicidad.
 *
 * Equivale a la `generate_series(fecha_inicio, LEAST(hoy, fecha_fin), intervalo)`
 * del cron SQL de ialimp (`lib/contab-recurrentes.ts`), pero en puro TypeScript
 * para poder usarse en cualquier vertical sin acceso a BD.
 *
 * La deduplicación (NOT EXISTS) la sigue haciendo cada vertical al persistir;
 * este helper solo devuelve las fechas que deberían existir.
 */
export function generarFechasRecurrente(
  plantilla: PlantillaRecurrente,
  hasta: Date
): Date[] {
  const fechas: Date[] = []
  const inicio = new Date(plantilla.fecha_inicio)
  const fin =
    plantilla.fecha_fin && plantilla.fecha_fin < hasta ? plantilla.fecha_fin : hasta

  // Cada fecha se calcula DESDE EL INICIO (n pasos), no encadenando: encadenar desde un día 31 arrastraba el recorte
  // (31/01 → 28/02 → 28/03…). El día de `inicio` se conserva y, en un mes más corto, se recorta a su último día.
  for (let n = 0; ; n++) {
    const cur = sumarPasos(inicio, plantilla.periodicidad, n)
    if (!(cur <= fin)) break // `!(<=)` y no `>`: una fecha inválida (NaN) corta en vez de buclear
    fechas.push(cur)
  }

  return fechas
}

const MESES_POR_PASO: Record<PeriodicidadRecurrente, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }

/** `inicio` + n pasos, en UTC (no depende del huso del servidor). Día 31 + 1 mes = último día del mes, nunca el mes siguiente. */
function sumarPasos(inicio: Date, periodicidad: PeriodicidadRecurrente, n: number): Date {
  const meses = inicio.getUTCMonth() + n * MESES_POR_PASO[periodicidad]
  const anio = inicio.getUTCFullYear() + Math.floor(meses / 12)
  const mes = ((meses % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  const d = new Date(inicio)
  d.setUTCFullYear(anio, mes, Math.min(inicio.getUTCDate(), ultimoDia))
  return d
}
