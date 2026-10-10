// Tras «Pedir precio» el presupuesto se prepara SOLO (decisión de Alberto, 05/10/2026).
//
// 🚨 NO GASTA NADA y no manda nada: `prepararPresupuesto` solo escribe `presupuesto`/`presupuesto_opcion`
// y lee coberturas con GET gratis. El botón «Preparar presupuesto» sigue para re-preparar con otra selección.
// Idempotente (si ya hay uno vivo sobre esa tarificación no se toca) y NUNCA lanza: la cotización ya está
// pagada y un fallo aquí no puede romper la respuesta de «Pedir precio».

// Las dependencias reales se importan en el momento de usarlas: así los tests de este módulo no
// arrastran Prisma (mismo patrón que `codeoscopic/coberturas-tarificacion.ts`).
import type { ResultadoPreparar } from './presupuesto'

export type DepsPrepararTrasTarificar = {
  /** ¿Ya hay un presupuesto vivo (no retirado) sobre esta tarificación? */
  existe: (ids: { correduriaId: string; tarificacionId: string }) => Promise<boolean>
  preparar: (correduriaId: string, entrada: { tarificacionId: string; actor: string }) => Promise<ResultadoPreparar>
  registrar: (donde: string, e: unknown) => void
}

const depsReales: DepsPrepararTrasTarificar = {
  existe: async ({ correduriaId, tarificacionId }) => {
    const { prismaAsegura } = await import('./asegura-db.ts')
    return (await prismaAsegura().presupuesto.count({ where: { correduriaId, tarificacionId, retiradoAt: null } })) > 0
  },
  preparar: async (correduriaId, entrada) => (await import('./presupuesto.ts')).prepararPresupuesto(correduriaId, entrada),
  registrar: (donde, e) => {
    void import('./error-cartera.ts').then((m) => m.registrarErrorCartera(donde, e))
  },
}

/** Devuelve `true` si se preparó (o reutilizó) uno; `false` si no había nada que hacer o falló. */
export async function prepararPresupuestoTrasTarificar(
  ids: { correduriaId: string; tarificacionId: string },
  actor: string,
  deps: DepsPrepararTrasTarificar = depsReales,
): Promise<boolean> {
  try {
    if (await deps.existe(ids)) return false
    const r = await deps.preparar(ids.correduriaId, { tarificacionId: ids.tarificacionId, actor })
    if (r.estado === 'ok') return true
    // Sin precios válidos, ramo sin comparativa, etc.: es el caso normal, no un error.
    return false
  } catch (e) {
    deps.registrar('presupuesto/auto-tras-tarificar', e)
    return false
  }
}
