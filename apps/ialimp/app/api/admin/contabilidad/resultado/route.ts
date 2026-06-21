import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'

export async function GET(req: Request) {
  try {
    const empresa_id = await requireEmpresaId()
    const { searchParams } = new URL(req.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        TO_CHAR(make_date(anio, mes, 1), 'YYYY-MM')  AS mes,
        TO_CHAR(make_date(anio, mes, 1), 'Mon YYYY') AS mes_label,
        ingresos_base AS ingresos,
        gastos_base   AS gastos,
        (ingresos_base - gastos_base) AS beneficio,
        CASE WHEN ingresos_base > 0
             THEN ROUND(((ingresos_base - gastos_base) / ingresos_base * 100)::numeric, 1)
             ELSE 0 END AS margen_pct
      FROM v_contab_pyg
      WHERE empresa_id = ${empresa_id}::uuid
        AND anio = ${year}
      ORDER BY mes
    `)

    return NextResponse.json({ rows })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
