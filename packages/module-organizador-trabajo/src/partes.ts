import type { Tarea, ParteTrabajo, ResumenTrabajador } from './types'

/** Crea el parte de trabajo de una tarea ejecutada, con la desviación estimado↔real. */
export function construirParte(
  tarea: Tarea,
  trabajadorId: string,
  minutosReales: number | null,
): ParteTrabajo {
  const desviacion = minutosReales == null ? null : minutosReales - tarea.duracion_estimada_min
  return {
    trabajador_id: trabajadorId,
    tarea_id: tarea.id,
    concepto: tarea.nombre,
    minutos_estimados: tarea.duracion_estimada_min,
    minutos_reales: minutosReales,
    desviacion_min: desviacion,
  }
}

/** Agrega los partes por trabajador (base de nómina / productividad). */
export function resumirPartes(partes: ParteTrabajo[]): ResumenTrabajador[] {
  const m = new Map<string, ResumenTrabajador>()
  for (const p of partes) {
    const cur = m.get(p.trabajador_id)
      ?? { trabajador_id: p.trabajador_id, tareas: 0, minutos_estimados: 0, minutos_reales: 0 }
    cur.tareas += 1
    cur.minutos_estimados += p.minutos_estimados
    cur.minutos_reales += p.minutos_reales ?? 0
    m.set(p.trabajador_id, cur)
  }
  return [...m.values()]
}
