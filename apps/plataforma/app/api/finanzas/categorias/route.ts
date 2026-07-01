import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/categorias?year=2025&month=6[&rolling=1]
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = Number(searchParams.get('year') ?? new Date().getFullYear())
  const month = Number(searchParams.get('month') ?? new Date().getMonth() + 1)
  const rolling = searchParams.get('rolling') === '1'

  let desde: string, hasta: string
  if (rolling) {
    const hastaDate = new Date(year, month, 0)
    hasta = hastaDate.toISOString().slice(0, 10)
    const desdeDate = new Date(year, month - 12, 1)
    desde = desdeDate.toISOString().slice(0, 10)
  } else {
    desde = `${year}-${String(month).padStart(2, '0')}-01`
    hasta = new Date(year, month, 0).toISOString().slice(0, 10)
  }

  const [rows, sinCat] = await Promise.all([
    prisma.$queryRaw<{ subcategoria: string; total: number; count: bigint }[]>`
      SELECT
        subcategoria,
        SUM(ABS(importe))::float as total,
        COUNT(*) as count
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND mb.subcategoria IS NOT NULL
        AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
      GROUP BY subcategoria
      ORDER BY total DESC
    `,
    prisma.$queryRaw<{ sin_categoria: bigint }[]>`
      SELECT COUNT(*) AS sin_categoria
      FROM movimientos_bancarios mb
      JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
      WHERE cb.cuenta_id = ${session.id}::uuid
        AND COALESCE(mb.destino, 'personal') = 'personal'
        AND mb.importe < 0
        AND mb.subcategoria IS NULL
        AND COALESCE(mb.duplicado_estado, '') <> 'ignorado'
        AND mb.fecha_operacion BETWEEN ${desde}::date AND ${hasta}::date
    `,
  ])

  return NextResponse.json({
    categorias: rows.map(r => ({ ...r, count: Number(r.count) })),
    sinCategoria: Number(sinCat[0]?.sin_categoria ?? 0),
  })
}
