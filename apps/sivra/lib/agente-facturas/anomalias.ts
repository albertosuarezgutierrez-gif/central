// Detección de recurrentes que faltan (las anomalías de importe/duplicado se
// resuelven en el flujo principal vía evaluar()/existeDuplicado()).
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface ReglaFaltante {
  fingerprint: string
  proveedor: string | null
  propiedad: string | null
  importe_esperado: number | null
}

// Reglas mensuales activas (con historial) que NO tienen gasto imputado en el
// mes/año dados → probable factura recurrente que aún no ha llegado.
export async function recurrentesQueFaltan(year: number, month: number): Promise<ReglaFaltante[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.fingerprint, r.proveedor, r.propiedad, r.importe_esperado
    FROM gastos_reglas r
    WHERE r.activa = true AND r.periodicidad = 'mensual' AND r.vistas >= 2
      AND NOT EXISTS (
        SELECT 1 FROM gastos g
        WHERE g.fingerprint = r.fingerprint
          AND EXTRACT(YEAR FROM g.fecha) = ${year}
          AND EXTRACT(MONTH FROM g.fecha) = ${month}
      )
  `)
  return rows.map((r) => ({
    fingerprint: r.fingerprint,
    proveedor: r.proveedor,
    propiedad: r.propiedad,
    importe_esperado: r.importe_esperado != null ? Number(r.importe_esperado) : null,
  }))
}

// Cada piso debe tener su factura de LUZ (electricidad) cada mes. Devuelve los
// pisos que NO tienen un gasto de electricidad imputado ese mes.
export async function luzPorPisoQueFalta(year: number, month: number): Promise<{ propiedad: string; nombre: string }[]> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT p.id AS propiedad, p.name AS nombre
    FROM properties p
    WHERE p."smoobuId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM gastos g
        WHERE g.propiedad = p.id
          AND NOT (g.revisado = false AND g.origen IS NOT NULL)
          AND EXTRACT(YEAR FROM g.fecha) = ${year} AND EXTRACT(MONTH FROM g.fecha) = ${month}
          AND (g.concepto ILIKE '%electricidad%' OR g.concepto ILIKE '%luz%'
               OR g.concepto ILIKE '%endesa%' OR g.concepto ILIKE '%totalenergies%'
               OR g.concepto ILIKE '%iberdrola%' OR g.concepto ILIKE '%naturgy%' OR g.concepto ILIKE '%holaluz%')
      )
    ORDER BY p.name
  `)
  return rows.map((r) => ({ propiedad: r.propiedad, nombre: r.nombre }))
}
