import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

type MovRow = { id: string; fecha: string; concepto: string | null; importe: number; subcategoria: string | null }

// GET /api/finanzas/categorias/movimientos?mode=fiscal_year|rolling_12&year=&month=&(comerciante=..|sin=1)
// Lista los movimientos SUELTOS (gasto personal) de un comercio, o los que están sin categoría.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') ?? 'fiscal_year'
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const month = parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1
  const comerciante = searchParams.get('comerciante')
  const sin = searchParams.get('sin') === '1'

  if (!comerciante && !sin) {
    return NextResponse.json({ error: 'Indica comerciante o sin=1' }, { status: 400 })
  }

  let desde: string, hasta: string
  if (mode === 'rolling_12') {
    hasta = new Date(year, month, 0).toISOString().slice(0, 10)
    desde = new Date(year, month - 12, 1).toISOString().slice(0, 10)
  } else {
    desde = `${year}-01-01`
    hasta = `${year}-12-31`
  }

  const filtro = sin
    ? Prisma.sql`AND mb.subcategoria IS NULL`
    : Prisma.sql`AND COALESCE(NULLIF(TRIM(mb.contraparte), ''), 'Sin identificar') = ${comerciante}`

  try {
    const rows = await prisma.$queryRaw<MovRow[]>(Prisma.sql`
      SELECT mb.id::text AS id,
             mb.fecha_operacion::text AS fecha,
             COALESCE(mb.concepto_normalizado, mb.concepto, mb.contraparte) AS concepto,
             mb.importe::float8 AS importe,
             mb.subcategoria
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND mb.importe < 0
        AND COALESCE(mb.destino, 'personal') = 'personal'
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
        ${filtro}
      ORDER BY mb.fecha_operacion DESC
      LIMIT 100`)
    return NextResponse.json({ movimientos: rows })
  } catch (e) {
    console.error('[/api/finanzas/categorias/movimientos]', e)
    return NextResponse.json({ error: 'Error al cargar movimientos' }, { status: 500 })
  }
}
