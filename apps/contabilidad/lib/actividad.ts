// Actividad de la empresa (CNAE) y plantilla sectorial. La app SUGIERE la plantilla por CNAE; el dueño o el gestor CONFIRMA o la cambia
// (pedido de Alberto, 05/11/2026). Cambiar de plantilla solo afecta a lo que se asiente DESPUÉS; no reescribe asientos pasados.
import { esSectorPlantilla, normalizarCnae, sugerenciaPorCnae, type SugerenciaCnae } from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'
import { filasSemillaPgc } from './alta-empresa.ts'

export type ResultadoActividad = { ok: true; sugerencia: SugerenciaCnae; cnae: string | null; sector: string | null } | { ok: false; errores: string[] }

/** `cnae` vacío = «sin CNAE» (se borra); `sector` ausente = no cambiar la plantilla actual. */
export async function guardarActividad(repo: RepoContable, e: { cnae?: unknown; sector?: unknown }, usuarioId: string | null): Promise<ResultadoActividad> {
  const errores: string[] = []
  const vacio = e.cnae === undefined || e.cnae === null || (typeof e.cnae === 'string' && e.cnae.trim() === '')
  const cnae = vacio ? null : normalizarCnae(e.cnae)
  if (!vacio && !cnae) errores.push('el CNAE debe tener 4 dígitos (p. ej. 4520 o 45.20)')
  let sector: string | null = null
  if (e.sector !== undefined && e.sector !== null && e.sector !== '') {
    if (!esSectorPlantilla(e.sector)) errores.push('plantilla no válida')
    else sector = e.sector
  }
  if (errores.length) return { ok: false, errores }
  const sugerencia = sugerenciaPorCnae(cnae)
  await repo.fijarActividad(cnae, sector)
  await repo.auditar({ actor: 'usuario', usuarioId, accion: 'cambiar_actividad', entidad: 'empresas', entidadId: repo.empresaId, detalle: { cnae, sector, sugerida: sugerencia.sector } })
  return { ok: true, sugerencia, cnae, sector }
}

/** Añade al plan las cuentas extra de OTRA plantilla (p. ej. un taller que también alquila material). Nunca quita ni modifica cuentas. */
export async function anadirCuentasDePlantilla(repo: RepoContable, sector: unknown, usuarioId: string | null): Promise<{ ok: true; anadidas: string[] } | { ok: false; errores: string[] }> {
  if (!esSectorPlantilla(sector)) return { ok: false, errores: ['plantilla no válida'] }
  const actuales = new Set((await repo.planCuentas()).map((c) => c.codigo))
  const nuevas = filasSemillaPgc(sector).filter((f) => !actuales.has(f.codigo))
  if (nuevas.length) await repo.sembrarPlan(nuevas)
  await repo.auditar({ actor: 'usuario', usuarioId, accion: 'anadir_cuentas_plantilla', entidad: 'plan_cuentas', detalle: { sector, anadidas: nuevas.map((f) => f.codigo) } })
  return { ok: true, anadidas: nuevas.map((f) => f.codigo) }
}
