import type { Tarea, TareaPlanificada } from './types'

/**
 * Para cada tarea con caducidad, calcula a más tardar CUÁNDO hay que empezarla
 * (vence_at − duración estimada) y la holgura desde "ahora". Ordena por el
 * momento de inicio más temprano; las tareas sin caducidad quedan al final.
 *
 * @param ahoraIso instante de referencia (ISO 8601)
 */
export function planificarPorCaducidad(tareas: Tarea[], ahoraIso: string): TareaPlanificada[] {
  const ahora = new Date(ahoraIso).getTime()
  const planificadas = tareas.map((t): TareaPlanificada => {
    if (!t.vence_at) {
      return { tarea_id: t.id, empezar_antes_de: null, holgura_min: null, en_riesgo: false }
    }
    const vence = new Date(t.vence_at).getTime()
    const empezarMs = vence - t.duracion_estimada_min * 60_000
    const holgura = Math.round((empezarMs - ahora) / 60_000)
    return {
      tarea_id: t.id,
      empezar_antes_de: new Date(empezarMs).toISOString(),
      holgura_min: holgura,
      en_riesgo: holgura < 0,
    }
  })
  return planificadas.sort((a, b) => {
    if (a.empezar_antes_de === null) return b.empezar_antes_de === null ? 0 : 1
    if (b.empezar_antes_de === null) return -1
    return a.empezar_antes_de < b.empezar_antes_de ? -1 : a.empezar_antes_de > b.empezar_antes_de ? 1 : 0
  })
}
