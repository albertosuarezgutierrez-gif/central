// apps/plataforma/lib/contable/contexto.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getMemoria, getHistorial } from './memoria'
import { formatearContexto, type CtxData } from './formato'

export type { CtxData } from './formato'
export { formatearContexto } from './formato'

// Fetch + formato. Defensivo (BD compartida, SQL crudo).
export async function construirContexto(cuentaId: string): Promise<string> {
  const year = new Date().getFullYear()

  const porDestino = await prisma.$queryRaw<CtxData['porDestino']>(Prisma.sql`
    SELECT coalesce(mb.destino, 'personal') AS destino,
           sum(CASE WHEN mb.importe < 0 THEN -mb.importe ELSE 0 END)::float8 AS gastos,
           sum(CASE WHEN mb.importe > 0 THEN  mb.importe ELSE 0 END)::float8 AS ingresos
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND EXTRACT(year FROM mb.fecha_operacion) = ${year}
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    GROUP BY 1 ORDER BY 2 DESC`).catch(() => [])

  const ultimos = await prisma.$queryRaw<CtxData['ultimos']>(Prisma.sql`
    SELECT mb.fecha_operacion::text AS fecha, mb.concepto,
           mb.importe::float8 AS importe, coalesce(mb.destino, '?') AS destino
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    ORDER BY mb.fecha_operacion DESC LIMIT 10`).catch(() => [])

  const facturas = await prisma.$queryRaw<CtxData['facturas']>(Prisma.sql`
    SELECT proveedor, importe::float8 AS importe, estado
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')
    ORDER BY fecha_factura DESC NULLS LAST LIMIT 10`).catch(() => [])

  const [memoria, historial] = await Promise.all([getMemoria(cuentaId), getHistorial(cuentaId, 8)])

  return formatearContexto({ year, porDestino, ultimos, facturas, memoria, historial })
}
