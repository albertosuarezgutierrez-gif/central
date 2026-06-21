import type { PeriodicidadRecurrente, PlantillaRecurrente } from './types'

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
  let cur = new Date(plantilla.fecha_inicio)
  const fin =
    plantilla.fecha_fin && plantilla.fecha_fin < hasta ? plantilla.fecha_fin : hasta

  while (cur <= fin) {
    fechas.push(new Date(cur))
    cur = siguienteFecha(cur, plantilla.periodicidad)
  }

  return fechas
}

function siguienteFecha(fecha: Date, periodicidad: PeriodicidadRecurrente): Date {
  const d = new Date(fecha)
  switch (periodicidad) {
    case 'mensual':    d.setMonth(d.getMonth() + 1); break
    case 'trimestral': d.setMonth(d.getMonth() + 3); break
    case 'semestral':  d.setMonth(d.getMonth() + 6); break
    case 'anual':      d.setFullYear(d.getFullYear() + 1); break
  }
  return d
}
