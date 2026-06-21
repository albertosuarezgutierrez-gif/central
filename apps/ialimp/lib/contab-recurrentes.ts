import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Materializa el apunte real de cada periodo de las plantillas recurrentes activas
// que aún no existan (idempotente: dedupe por recurrente_origen + fecha del periodo).
// Recorre desde fecha_inicio hasta min(hoy, fecha_fin) según la periodicidad.
// `soloId` limita la generación a una plantilla concreta (al crearla, para backfill
// inmediato). Sin argumento, procesa todas las plantillas activas (uso del cron).
export async function generarRecurrentes(soloId?: string) {
  const cond = soloId ? Prisma.sql`AND r.id = ${soloId}::uuid` : Prisma.sql``
  const intervalo = Prisma.sql`
    CASE r.periodicidad
      WHEN 'trimestral' THEN interval '3 months'
      WHEN 'semestral'  THEN interval '6 months'
      WHEN 'anual'      THEN interval '1 year'
      ELSE interval '1 month'
    END`

  const gastos = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO documentos_contables (
      empresa_id, propiedad_id, tipo_doc, ambito, activo,
      proveedor, fecha_doc, categoria, descripcion,
      base_imponible, porcentaje_iva, cuota_iva, total,
      pagado, recurrente_origen
    )
    SELECT
      r.empresa_id, r.propiedad_id, 'manual', 'empresa', true,
      r.proveedor, g.d::date, r.categoria, r.concepto,
      r.base_imponible, r.porcentaje_iva,
      ROUND(r.base_imponible * r.porcentaje_iva / 100, 2),
      r.base_imponible + ROUND(r.base_imponible * r.porcentaje_iva / 100, 2),
      false, r.id
    FROM apuntes_recurrentes r
    CROSS JOIN LATERAL generate_series(
      r.fecha_inicio::timestamp,
      LEAST(CURRENT_DATE, COALESCE(r.fecha_fin, CURRENT_DATE))::timestamp,
      ${intervalo}
    ) AS g(d)
    WHERE r.activo = true AND r.tipo = 'gasto' ${cond}
      AND NOT EXISTS (
        SELECT 1 FROM documentos_contables dc
        WHERE dc.recurrente_origen = r.id AND dc.fecha_doc = g.d::date
      )
  `)

  const ingresos = await prisma.$executeRaw(Prisma.sql`
    INSERT INTO ingresos_manuales (
      empresa_id, propiedad_id, concepto, categoria, fecha,
      base_imponible, porcentaje_iva, cuota_iva, total,
      cobrado, recurrente_origen
    )
    SELECT
      r.empresa_id, r.propiedad_id, r.concepto, r.categoria, g.d::date,
      r.base_imponible, r.porcentaje_iva,
      ROUND(r.base_imponible * r.porcentaje_iva / 100, 2),
      r.base_imponible + ROUND(r.base_imponible * r.porcentaje_iva / 100, 2),
      false, r.id
    FROM apuntes_recurrentes r
    CROSS JOIN LATERAL generate_series(
      r.fecha_inicio::timestamp,
      LEAST(CURRENT_DATE, COALESCE(r.fecha_fin, CURRENT_DATE))::timestamp,
      ${intervalo}
    ) AS g(d)
    WHERE r.activo = true AND r.tipo = 'ingreso' ${cond}
      AND NOT EXISTS (
        SELECT 1 FROM ingresos_manuales im
        WHERE im.recurrente_origen = r.id AND im.fecha = g.d::date
      )
  `)

  await prisma.$executeRaw(Prisma.sql`
    UPDATE apuntes_recurrentes r
    SET ultima_generada = LEAST(CURRENT_DATE, COALESCE(fecha_fin, CURRENT_DATE))
    WHERE activo = true ${cond}
  `)

  return { gastos, ingresos }
}
