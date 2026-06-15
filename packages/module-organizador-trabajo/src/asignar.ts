import type { Tarea, Trabajador, PlanAsignacion } from './types'

const PESO_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 }

/** ¿Este trabajador puede ejecutar la tarea? (rol propio o capacidad extra en `roles`). */
function puede(trab: Trabajador, tarea: Tarea): boolean {
  if (!tarea.requiere_rol) return true
  if (trab.rol === tarea.requiere_rol) return true
  return !!trab.roles?.includes(tarea.requiere_rol)
}

/**
 * Reparte las tareas pendientes entre los trabajadores disponibles.
 * Orden de servicio: prioridad → caducidad más próxima (vence antes) → orden estable.
 * Para cada tarea elige al trabajador apto con MENOS minutos imputados (equidad).
 * Imputa el tiempo estimado de la tarea al trabajador asignado.
 */
export function asignarTrabajo(tareas: Tarea[], trabajadores: Trabajador[]): PlanAsignacion {
  const disponibles = trabajadores.filter(t => t.disponible)
  const minutos: Record<string, number> = {}
  for (const t of disponibles) minutos[t.id] = 0

  const pendientes = tareas
    .filter(t => (t.estado ?? 'pendiente') === 'pendiente')
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const pa = PESO_PRIORIDAD[a.t.prioridad] ?? 2
      const pb = PESO_PRIORIDAD[b.t.prioridad] ?? 2
      if (pa !== pb) return pa - pb
      const va = a.t.vence_at ?? '~'   // '~' > cualquier ISO → las sin caducidad al final
      const vb = b.t.vence_at ?? '~'
      if (va !== vb) return va < vb ? -1 : 1
      return a.i - b.i                 // estable
    })
    .map(x => x.t)

  const asignaciones: PlanAsignacion['asignaciones'] = []
  const sin_asignar: string[] = []
  for (const tarea of pendientes) {
    const cand = disponibles
      .filter(t => puede(t, tarea))
      .sort((a, b) => minutos[a.id] - minutos[b.id])[0]
    if (!cand) { sin_asignar.push(tarea.id); continue }
    asignaciones.push({ trabajador_id: cand.id, tarea_id: tarea.id })
    minutos[cand.id] += tarea.duracion_estimada_min
  }
  return { asignaciones, sin_asignar, minutos_por_trabajador: minutos }
}
