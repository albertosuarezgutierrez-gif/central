import type { Tarea, Aviso } from './types'

/** Una tarea está "lista" si está pendiente y todos sus prerequisitos están HECHOS. */
function prerequisitosCumplidos(tarea: Tarea, hechas: Set<string>): boolean {
  const deps = tarea.depende_de ?? []
  return deps.every(id => hechas.has(id))
}

function idsHechas(tareas: Tarea[]): Set<string> {
  return new Set(tareas.filter(t => t.estado === 'hecha').map(t => t.id))
}

/**
 * Tareas pendientes cuyos prerequisitos están TODOS hechos (o que no tienen).
 * Un prerequisito cuyo id no aparece en la lista se considera NO cumplido (seguridad:
 * no destrabamos algo por una dependencia que no podemos verificar).
 */
export function tareasDesbloqueadas(tareas: Tarea[]): Tarea[] {
  const hechas = idsHechas(tareas)
  return tareas.filter(
    t => (t.estado ?? 'pendiente') === 'pendiente' && prerequisitosCumplidos(t, hechas),
  )
}

/** Tareas pendientes que aún esperan a algún prerequisito, con la lista de los que faltan. */
export function tareasBloqueadas(tareas: Tarea[]): { tarea_id: string; faltan: string[] }[] {
  const hechas = idsHechas(tareas)
  const out: { tarea_id: string; faltan: string[] }[] = []
  for (const t of tareas) {
    if ((t.estado ?? 'pendiente') !== 'pendiente') continue
    const faltan = (t.depende_de ?? []).filter(id => !hechas.has(id))
    if (faltan.length > 0) out.push({ tarea_id: t.id, faltan })
  }
  return out
}

/**
 * Al marcar `tareaCompletadaId` como hecha, devuelve los avisos de las tareas que
 * quedan RECIÉN desbloqueadas (estaban bloqueadas solo por ella, o por ella y otras
 * ya hechas). El caso "frío termina la patata → avisa a caliente" de la cocina.
 */
export function avisosAlCompletar(tareaCompletadaId: string, tareas: Tarea[]): Aviso[] {
  const desbloqueadasAntes = new Set(tareasDesbloqueadas(tareas).map(t => t.id))
  const despues = tareas.map(t =>
    t.id === tareaCompletadaId ? { ...t, estado: 'hecha' as const } : t,
  )
  return tareasDesbloqueadas(despues)
    .filter(t => !desbloqueadasAntes.has(t.id))
    .filter(t => (t.depende_de ?? []).includes(tareaCompletadaId))
    .map(t => ({
      tarea_id: t.id,
      nombre: t.nombre,
      desbloqueada_por: tareaCompletadaId,
      mensaje: `Lista para empezar: ${t.nombre}`,
    }))
}
