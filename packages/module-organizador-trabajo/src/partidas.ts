import type { Tarea, CargaPartida } from './types'

/**
 * Agrupa las tareas por su partida (frío, caliente, corte, montaje…), en el orden
 * en que aparece cada partida por primera vez. `minutos_estimados` suma solo las
 * tareas PENDIENTES (la carga que aún queda en esa sección); `tareas` las lista todas.
 * Las tareas sin partida se agrupan en 'sin_partida'.
 */
export function agruparPorPartida(tareas: Tarea[]): CargaPartida[] {
  const orden: string[] = []
  const mapa = new Map<string, CargaPartida>()
  for (const t of tareas) {
    const clave = t.partida ?? 'sin_partida'
    let carga = mapa.get(clave)
    if (!carga) {
      carga = { partida: clave, tareas: [], minutos_estimados: 0 }
      mapa.set(clave, carga)
      orden.push(clave)
    }
    carga.tareas.push(t)
    if ((t.estado ?? 'pendiente') === 'pendiente') {
      carga.minutos_estimados += t.duracion_estimada_min
    }
  }
  return orden.map(k => mapa.get(k)!)
}
