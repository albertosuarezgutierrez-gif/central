import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear())
  const month = Number(req.nextUrl.searchParams.get('month') ?? new Date().getMonth() + 1)

  const desde = `${year}-${String(month).padStart(2, '0')}-01`
  const hasta = new Date(year, month, 0).toISOString().slice(0, 10)

  const rows = await prisma.$queryRaw<{ subcategoria: string; total: number; count: bigint }[]>`
    SELECT
      subcategoria,
      SUM(ABS(importe))::float as total,
      COUNT(*) as count
    FROM movimientos_bancarios
    WHERE subcategoria IS NOT NULL
      AND fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
      AND COALESCE(duplicado_estado, '') <> 'ignorado'
    GROUP BY subcategoria
    ORDER BY total DESC
  `

  return NextResponse.json(rows.map(r => ({ ...r, count: Number(r.count) })))
}
