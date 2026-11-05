// Rentabilidad por dimensión de la empresa (eje configurable por sector).
import { plantillaDe, rentabilidadDeFilas, type DimensionDef, type RentabilidadDimension } from '@central/module-contabilidad'
import type { RepoContable } from './repo.ts'

export function dimensionesDe(sector: unknown): readonly DimensionDef[] {
  return plantillaDe(sector).dimensiones
}

/** Dimensión pedida si pertenece al sector; si no, la primera del sector (lista blanca: nunca una clave arbitraria a la consulta). */
export function elegirDimension(sector: unknown, pedida: unknown): DimensionDef {
  const ds = dimensionesDe(sector)
  return ds.find((d) => d.clave === pedida) ?? ds[0]
}

export async function datosRentabilidad(repo: RepoContable, sector: unknown, pedida: unknown, rango: { desde: string; hasta: string }): Promise<{ dimension: DimensionDef; filas: RentabilidadDimension[] }> {
  const dimension = elegirDimension(sector, pedida)
  return { dimension, filas: rentabilidadDeFilas(await repo.sumasPorDimension(dimension.clave, rango)) }
}
