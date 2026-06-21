import type { Tarea, Trabajador, EstadoCarga } from './types'
import { estaOcioso } from './carga.ts'

const PESO_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 }

function puede(trab: Trabajador, tarea: Tarea): boolean {
  if (!tarea.requiere_rol) return true
  if (trab.rol === tarea.requiere_rol) return true
  return !!trab.roles?.includes(tarea.requiere_rol)
}

/**
 * Caso "camarero en hora floja": si la carga viva es baja (trabajador ocioso),
 * devuelve la siguiente tarea operativa pendiente que puede hacer. Si hay
 * trabajo (carga alta), no está disponible, o no hay tareas aptas → null.
 * Selección: prioridad y, a igualdad, la tarea más corta (cabe en el hueco).
 */
export function siguienteTarea(
  trabajador: Trabajador,
  tareas: Tarea[],
  carga: EstadoCarga,
): Tarea | null {
  if (!trabajador.disponible) return null
  if (!estaOcioso(carga)) return null
  const candidatas = tareas
    .filter(t => (t.estado ?? 'pendiente') === 'pendiente')
    .filter(t => puede(trabajador, t))
    .sort((a, b) => {
      const pa = PESO_PRIORIDAD[a.prioridad] ?? 2
      const pb = PESO_PRIORIDAD[b.prioridad] ?? 2
      if (pa !== pb) return pa - pb
      return a.duracion_estimada_min - b.duracion_estimada_min
    })
  return candidatas[0] ?? null
}
