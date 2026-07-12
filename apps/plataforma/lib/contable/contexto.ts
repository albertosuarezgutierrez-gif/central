// apps/plataforma/lib/contable/contexto.ts
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getResumenFinanciero } from '@/lib/finanzas'
import { getMemoria, getHistorial } from './memoria'
import { formatearContexto, type CtxData, type Candidato } from './formato'

export type { CtxData, Candidato } from './formato'
export { formatearContexto } from './formato'

export async function construirContexto(cuentaId: string): Promise<{ texto: string; candidatos: Candidato[] }> {
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

  // Candidatos accionables: los "por revisar" primero, luego los recientes. Con id real.
  const rows = await prisma.$queryRaw<{ mov_id: string; fecha: string; concepto: string | null; importe: number; destino: string; por_revisar: boolean; banco: string | null }[]>(Prisma.sql`
    SELECT mb.id::text AS mov_id, mb.fecha_operacion::text AS fecha,
           coalesce(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
           mb.importe::float8 AS importe, coalesce(mb.destino, '?') AS destino,
           (mb.requiere_revision OR NOT coalesce(mb.destino_confirmado, false)) AS por_revisar,
           coalesce(cb.alias, cb.banco) AS banco
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND (mb.duplicado_estado IS NULL OR mb.duplicado_estado <> 'ignorado')
    ORDER BY (mb.requiere_revision OR NOT coalesce(mb.destino_confirmado, false)) DESC, mb.fecha_operacion DESC
    LIMIT 12`).catch(() => [])
  const candidatos: Candidato[] = rows.map((r, i) => ({
    ref: `#${i + 1}`, movId: r.mov_id, fecha: r.fecha, concepto: r.concepto || '', importe: r.importe, destino: r.destino, porRevisar: r.por_revisar, banco: r.banco,
  }))

  const facturas = await prisma.$queryRaw<CtxData['facturas']>(Prisma.sql`
    SELECT proveedor, importe::float8 AS importe, estado
    FROM facturas_proveedor
    WHERE cuenta_id = ${cuentaId}::uuid AND estado NOT IN ('pagada', 'rechazada')
    ORDER BY fecha_factura DESC NULLS LAST LIMIT 10`).catch(() => [])

  // Panorama de negocios: estructura (sociedad → negocios) y saldos bancarios. Consultas baratas
  // y directas (sin salir a los adaptadores de cada vertical, que harían HTTP y añadirían latencia).
  const estructura = await prisma.$queryRaw<CtxData['estructura']>(Prisma.sql`
    SELECT s.nombre AS sociedad, n.nombre AS negocio, n.sector AS sector
    FROM sociedades s
    LEFT JOIN negocios n ON n.sociedad_id = s.id
    WHERE s.cuenta_id = ${cuentaId}::uuid
    ORDER BY s.nombre, n.nombre`).catch(() => [])

  const saldos = await prisma.$queryRaw<CtxData['saldos']>(Prisma.sql`
    SELECT s.nombre AS sociedad, cb.banco AS banco, cb.alias AS alias, cb.saldo_actual::float8 AS saldo
    FROM cuentas_bancarias cb
    JOIN sociedades s ON s.id = cb.sociedad_id
    WHERE cb.cuenta_id = ${cuentaId}::uuid
      AND NOT coalesce(cb.oculta, false)
      AND coalesce(cb.titular, 'titular') <> 'conyuge'
    ORDER BY s.nombre, cb.banco`).catch(() => [])

  const [memoria, historial] = await Promise.all([getMemoria(cuentaId), getHistorial(cuentaId, 8)])

  // Posición fiscal IRPF del año (misma fuente que /finanzas). Best-effort: si falla, se omite.
  const resumen = await getResumenFinanciero(cuentaId, year).catch(() => null)
  const rf = resumen?.fiscal
  const fiscal: CtxData['fiscal'] = rf && rf.tramoActual ? {
    base: rf.baseImponibleEstimada, tramoTipo: rf.tramoActual.tipo,
    tramoDesde: rf.tramoActual.desde, tramoHasta: rf.tramoActual.hasta,
    tipoEfectivo: rf.tipoEfectivo, margenProximo: rf.margenHastaProximoTramo,
    ahorroBajar: rf.ahorroBajarTramo,
    exento: resumen?.correduria.prestacionesExentas,
  } : null

  const texto = formatearContexto({ year, porDestino, candidatos, facturas, memoria, historial, fiscal, estructura, saldos })
  return { texto, candidatos }
}
