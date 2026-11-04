// PERMISOS DE NAVEGACIÓN del tarificador RPA (0.3.46, 04/11/2026) — reglas PURAS de asegura: qué filas de BD viajan al worker en cada
// modo. La validación es la del módulo (`permisos-navegacion.ts`); aquí solo se decide el ALCANCE por modo. Lectura de BD en
// `tarificador-permisos-navegacion.ts`; SQL en prisma/sql/2026-11-04d_tarificador_permisos_navegacion.sql.
//
// 🚨 TARIFICAR ≠ EMITIR: la emisión y la prueba de humo NUNCA reciben permisos; tarificar, solo rutas (los adaptadores pulsan por código);
//    exploración y pilotaje, los de SU entrada. Lo que no valida se queda aquí (solo ids y códigos al log); el worker revalida lo que llega.

import { entradasDeCompaniaRamo, esEntradaExploracion, filasDePermisos, permisosNavegacionDe, permisosTarificacionDe, type FilaPermisoNavegacion, type PermisoIgnorado } from '@central/module-tarificacion'

export type ModoTrabajoPermisos = 'tarificar' | 'emision' | 'exploracion' | 'humo' | 'pilotaje'

/** Entradas cuyas filas hay que LEER para un trabajo (vacío = no se lee la BD). PURA. */
export function entradasParaPermisos(modo: ModoTrabajoPermisos, compania: string, ramo: string, entrada: string | null): string[] {
  if (modo === 'exploracion' || modo === 'pilotaje') return entrada !== null && esEntradaExploracion(entrada) ? [entrada] : []
  if (modo === 'tarificar') return entradasDeCompaniaRamo(compania, ramo)
  return []
}

/**
 * Las filas CANÓNICAS (ya validadas) que viajan al worker con el trabajo, o `null` si ninguna (la clave ni se pone). PURA.
 * Fail-closed: `filas` ilegible o un modo sin permisos → `null`.
 */
export function permisosParaWorker(
  modo: ModoTrabajoPermisos,
  t: { compania: string; ramo: string; entrada: string | null },
  filas: unknown,
): { filas: FilaPermisoNavegacion[] | null; ignorados: PermisoIgnorado[] } {
  if (modo === 'exploracion' || modo === 'pilotaje') {
    if (t.entrada === null || !esEntradaExploracion(t.entrada)) return { filas: null, ignorados: [] }
    const r = permisosNavegacionDe(t.entrada, filas)
    const out = filasDePermisos(r.permisos)
    return { filas: out.length > 0 ? out : null, ignorados: r.ignorados }
  }
  if (modo === 'tarificar') {
    const r = permisosTarificacionDe(t.compania, t.ramo, filas)
    const out = filasDePermisos(r.permisos)
    return { filas: out.length > 0 ? out : null, ignorados: r.ignorados }
  }
  return { filas: null, ignorados: [] }
}
