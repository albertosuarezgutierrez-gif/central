// Lógica de consolidación con eliminación de operaciones intercompany.
// Funciones puras sobre los tipos genéricos (sin BD).
import type {
  DetalleSociedadConsolidado,
  OperacionIntercompany,
  ResultadoConsolidado,
  ResumenSociedad,
  Totales,
} from './types'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Una operación es intercompany si origen y destino son sociedades distintas del conjunto dado. */
export function esIntercompany(op: OperacionIntercompany, holding: Set<string>): boolean {
  return (
    op.sociedadOrigenId !== op.sociedadDestinoId &&
    holding.has(op.sociedadOrigenId) &&
    holding.has(op.sociedadDestinoId)
  )
}

/** Filtra las operaciones internas al holding (las que se eliminan). */
export function operacionesInternas(
  operaciones: OperacionIntercompany[],
  holding: Set<string>,
): OperacionIntercompany[] {
  return operaciones.filter((op) => esIntercompany(op, holding))
}

/** Total facturado internamente (lo que se elimina tanto de ingresos como de gastos). */
export function totalIntercompany(
  operaciones: OperacionIntercompany[],
  holding: Set<string>,
): number {
  return round2(
    operacionesInternas(operaciones, holding).reduce((s, op) => s + op.importe, 0),
  )
}

function sumaTotales(sociedades: ResumenSociedad[]): Totales {
  const ingresos = round2(sociedades.reduce((s, x) => s + x.ingresos, 0))
  const gastos = round2(sociedades.reduce((s, x) => s + x.gastos, 0))
  return { ingresos, gastos, resultado: round2(ingresos - gastos) }
}

/**
 * Consolida las cifras del holding ELIMINANDO las operaciones intercompany.
 *
 * El holding = el conjunto de sociedades presentes en `sociedades`. Una operación se elimina solo
 * si AMBOS extremos pertenecen al holding (si el destino es un cliente externo, es ingreso real y
 * NO se elimina; si el origen es un proveedor externo, es gasto real y NO se elimina).
 *
 * Propiedad clave (invariante): el RESULTADO consolidado es igual al resultado bruto — eliminar
 * intercompany no cambia el neto del grupo, solo deshincha ingresos y gastos inflados.
 */
export function consolidar(
  sociedades: ResumenSociedad[],
  operaciones: OperacionIntercompany[] = [],
): ResultadoConsolidado {
  const holding = new Set(sociedades.map((s) => s.sociedadId))
  const internas = operacionesInternas(operaciones, holding)

  const ingresosICporSociedad = new Map<string, number>()
  const gastosICporSociedad = new Map<string, number>()
  for (const op of internas) {
    ingresosICporSociedad.set(
      op.sociedadOrigenId,
      (ingresosICporSociedad.get(op.sociedadOrigenId) ?? 0) + op.importe,
    )
    gastosICporSociedad.set(
      op.sociedadDestinoId,
      (gastosICporSociedad.get(op.sociedadDestinoId) ?? 0) + op.importe,
    )
  }

  const porSociedad: DetalleSociedadConsolidado[] = sociedades.map((s) => ({
    sociedadId: s.sociedadId,
    ingresos: round2(s.ingresos),
    gastos: round2(s.gastos),
    resultado: round2(s.ingresos - s.gastos),
    ingresosIntercompany: round2(ingresosICporSociedad.get(s.sociedadId) ?? 0),
    gastosIntercompany: round2(gastosICporSociedad.get(s.sociedadId) ?? 0),
  }))

  const agregadoBruto = sumaTotales(sociedades)
  const eliminado = round2(internas.reduce((acc, op) => acc + op.importe, 0))
  const eliminaciones = { ingresos: eliminado, gastos: eliminado }

  const ingresos = round2(agregadoBruto.ingresos - eliminado)
  const gastos = round2(agregadoBruto.gastos - eliminado)
  const consolidado: Totales = { ingresos, gastos, resultado: round2(ingresos - gastos) }

  return { porSociedad, agregadoBruto, eliminaciones, consolidado }
}
