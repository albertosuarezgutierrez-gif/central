// Capa intercompany del consolidado (casa de marcas / holding).
//
// Es una capa ADITIVA e independiente: NO toca el cálculo existente del dashboard
// (`getResumenNegocio` + la suma bruta de `totalIngresos`/`totalResultado`). Aquí se lee
// la tabla `operaciones_intercompany` (las facturas ENTRE sociedades del mismo holding) y
// se delega TODA la lógica de consolidación al módulo PURO `@central/module-intercompany`
// (`consolidar`), reutilizable por cualquier cliente/sector.
//
// Tolerancia a tabla ausente: si `operaciones_intercompany` aún no existe (migración no
// aplicada) o no hay filas, devolvemos []. Con [] operaciones, `consolidar()` deja el
// consolidado IGUAL a la suma bruta → cero cambios sobre los números reales de hoy.
import { prisma } from './db'
import { consolidar } from '@central/module-intercompany'
import type { OperacionIntercompany, ResultadoConsolidado } from '@central/module-intercompany'
import { filaAOperacion, resumenPorSociedad, type OperacionIntercompanyRow } from './intercompany-mapeo'

export type { ResultadoConsolidado } from '@central/module-intercompany'
export { filaAOperacion, resumenPorSociedad } from './intercompany-mapeo'

/** Lee las operaciones intercompany de la cuenta (año dado). Tolera tabla ausente → []. */
export async function getOperacionesIntercompany(
  cuentaId: string,
  anio: number,
): Promise<OperacionIntercompany[]> {
  try {
    const rows = await prisma.$queryRaw<OperacionIntercompanyRow[]>`
      SELECT id, sociedad_origen_id, sociedad_destino_id, importe,
             concepto, fecha, tipo, parent_id, parent_type
      FROM operaciones_intercompany
      WHERE cuenta_id = ${cuentaId}::uuid
        AND (fecha IS NULL OR EXTRACT(YEAR FROM fecha) = ${anio})
    `
    return rows.map(filaAOperacion)
  } catch {
    // Tabla no creada todavía (migración no aplicada) o error de lectura: sin operaciones.
    return []
  }
}

/**
 * Consolidado del holding con eliminación intercompany. Si no hay operaciones internas
 * (o la tabla no existe), `consolidado` === suma bruta (no cambia el dashboard actual).
 */
export async function getConsolidadoIntercompany(
  cuentaId: string,
  anio: number,
  negocios: Array<{ sociedadId: string; ingresos: number; gastos: number; disponible: boolean }>,
  sociedadIdsHolding: string[] = [],
): Promise<ResultadoConsolidado> {
  const sociedades = resumenPorSociedad(negocios, sociedadIdsHolding)
  const operaciones = await getOperacionesIntercompany(cuentaId, anio)
  return consolidar(sociedades, operaciones)
}
