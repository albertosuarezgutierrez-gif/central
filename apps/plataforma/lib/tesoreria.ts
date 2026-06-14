// Tesorería (Fase 5): I/O sobre la BD + composición. La lógica pura (detección de
// recurrentes, proyección) vive en lib/tesoreria-core.ts (testeable con node --test).

import { prisma } from './db'
import { getSaldoConsolidado } from './banca'
import { detectarRecurrentes, proyectar, type Recurrente, type Proyeccion } from './tesoreria-core'

export type Tesoreria = { saldoActual: number; recurrentes: Recurrente[]; proyecciones: Proyeccion[] }

export async function getTesoreria(
  cuentaId: string,
  hoy: string = new Date().toISOString().slice(0, 10),
): Promise<Tesoreria> {
  const [saldo, rows] = await Promise.all([
    getSaldoConsolidado(cuentaId),
    prisma.$queryRaw<Array<{ fecha: Date; importe: unknown; concepto: string | null }>>`
      SELECT mb.fecha_operacion AS fecha, mb.importe, mb.concepto
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${cuentaId}::uuid AND mb.fecha_operacion IS NOT NULL
      ORDER BY mb.fecha_operacion
    `,
  ])

  const movs = rows.map(r => ({
    fecha: r.fecha.toISOString().slice(0, 10),
    importe: Number(r.importe),
    concepto: r.concepto ?? '',
  }))

  const recurrentes = detectarRecurrentes(movs)
  const proyecciones = [30, 60, 90].map(d => proyectar(saldo.total, recurrentes, d, hoy))
  return { saldoActual: saldo.total, recurrentes, proyecciones }
}
