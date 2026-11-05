// Rentabilidad por dimensión de la empresa (eje configurable por sector).
import { dimensionesPorCnae, rentabilidadDeFilas, type DimensionDef, type RentabilidadDimension } from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'

/** Ejes del sector acotados por la actividad (CNAE); sin CNAE, todos los de la plantilla. */
export function dimensionesDe(sector: unknown, cnae: unknown = null): readonly DimensionDef[] {
  return dimensionesPorCnae(sector, cnae)
}

/** Dimensión pedida si pertenece al sector; si no, la primera del sector (lista blanca: nunca una clave arbitraria a la consulta). */
export function elegirDimension(sector: unknown, pedida: unknown, cnae: unknown = null): DimensionDef {
  const ds = dimensionesDe(sector, cnae)
  return ds.find((d) => d.clave === pedida) ?? ds[0]
}

export async function datosRentabilidad(repo: RepoContable, sector: unknown, pedida: unknown, rango: { desde: string; hasta: string }, cnae: unknown = null): Promise<{ dimension: DimensionDef; filas: RentabilidadDimension[] }> {
  const dimension = elegirDimension(sector, pedida, cnae)
  return { dimension, filas: rentabilidadDeFilas(await repo.sumasPorDimension(dimension.clave, rango)) }
}
