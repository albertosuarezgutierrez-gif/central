import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

const PROP_NAMES: Record<string, string> = {
  prop_busto_reform:       'Busto Reform',
  prop_duplex_center:      'Duplex Center',
  prop_house_sevillana:    'House Sevillana',
  prop_luxury_busto:       'Luxury Busto',
  prop_multi_apartamentos: 'Gastos compartidos',
}

const DEDUCIBLES_100 = ['LIMPIEZA', 'MANTENIMIENTO', 'PLATAFORMAS', 'REFORMAS', 'MOBILIARIO']
const DEDUCIBLES_PROP = ['SUMINISTROS', 'SEGURO', 'IMPUESTOS', 'COMUNIDAD', 'OTRO']

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()

  // Ingresos por propiedad y trimestre
  const incomes = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      i."propertyId" AS property_id,
      p.name AS property_name,
      EXTRACT(QUARTER FROM i."checkIn") AS trimestre,
      SUM(i.amount) AS total,
      COUNT(*) AS reservas,
      SUM(i.nights) AS noches
    FROM incomes i
    LEFT JOIN properties p ON p.id = i."propertyId"
    WHERE EXTRACT(YEAR FROM i."checkIn") = ${year}
      AND i."propertyId" NOT LIKE '%personal%'
    GROUP BY i."propertyId", p.name, EXTRACT(QUARTER FROM i."checkIn")
    ORDER BY i."propertyId", trimestre
  `)

  // Gastos por propiedad, categoría y trimestre
  const gastos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT
      propiedad AS property_id,
      categoria,
      EXTRACT(QUARTER FROM fecha) AS trimestre,
      SUM(total) AS total
    FROM gastos
    WHERE EXTRACT(YEAR FROM fecha) = ${year}
      AND propiedad IS NOT NULL
      AND propiedad NOT LIKE '%personal%'
      AND NOT (revisado = false AND origen IS NOT NULL)
    GROUP BY propiedad, categoria, EXTRACT(QUARTER FROM fecha)
    ORDER BY propiedad, trimestre, categoria
  `)

  // Build per-property summary
  const propMap: Record<string, {
    propertyName: string
    trimestres: Record<number, {
      ingresos: number; reservas: number; noches: number
      gastos: Record<string, number>
    }>
  }> = {}

  for (const r of incomes) {
    const pid = r.property_id
    const tri = Number(r.trimestre)
    if (!propMap[pid]) propMap[pid] = { propertyName: r.property_name ?? PROP_NAMES[pid] ?? pid, trimestres: {} }
    if (!propMap[pid].trimestres[tri]) propMap[pid].trimestres[tri] = { ingresos: 0, reservas: 0, noches: 0, gastos: {} }
    propMap[pid].trimestres[tri].ingresos  += Number(r.total)
    propMap[pid].trimestres[tri].reservas  += Number(r.reservas)
    propMap[pid].trimestres[tri].noches    += Number(r.noches)
  }

  for (const r of gastos) {
    const pid = r.property_id
    const tri = Number(r.trimestre)
    if (!propMap[pid]) propMap[pid] = { propertyName: PROP_NAMES[pid] ?? pid, trimestres: {} }
    if (!propMap[pid].trimestres[tri]) propMap[pid].trimestres[tri] = { ingresos: 0, reservas: 0, noches: 0, gastos: {} }
    propMap[pid].trimestres[tri].gastos[r.categoria] =
      (propMap[pid].trimestres[tri].gastos[r.categoria] ?? 0) + Number(r.total)
  }

  // Flatten for CSV and response
  const rows: any[] = []
  for (const [pid, prop] of Object.entries(propMap)) {
    for (let tri = 1; tri <= 4; tri++) {
      const t = prop.trimestres[tri]
      if (!t) continue
      const gastos100 = DEDUCIBLES_100.reduce((s, c) => s + (t.gastos[c] ?? 0), 0)
      const gastosProp = DEDUCIBLES_PROP.reduce((s, c) => s + (t.gastos[c] ?? 0), 0)
      const gastosAlquiler = t.gastos['ALQUILER'] ?? 0
      const totalGastos = gastos100 + gastosProp + gastosAlquiler
      rows.push({
        propertyId: pid,
        propertyName: prop.propertyName,
        trimestre: tri,
        ingresos: Math.round(t.ingresos * 100) / 100,
        reservas: t.reservas,
        noches: t.noches,
        gastos100: Math.round(gastos100 * 100) / 100,
        gastosProp: Math.round(gastosProp * 100) / 100,
        gastosAlquiler: Math.round(gastosAlquiler * 100) / 100,
        totalGastos: Math.round(totalGastos * 100) / 100,
        resultadoNeto: Math.round((t.ingresos - totalGastos) * 100) / 100,
        desglose: t.gastos,
      })
    }
  }

  return NextResponse.json({ year, rows })
}
