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
  // La pestaña pasa el TRIMESTRE como `month` (0 = "Año"), que no es un mes válido. Para el modo
  // rolling lo saneamos a 1-12 (0 → 12); el modo año fiscal ignora el mes y cubre Ene-Dic.
  const monthRaw = Number(searchParams.get('month') ?? new Date().getMonth() + 1)
  const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : 12
  const rolling = searchParams.get('rolling') === '1'

  // Rango de fechas EXPLÍCITO (la pestaña Categorías filtra por fechas, por defecto el mes en curso).
  // Si vienen `desde`/`hasta` válidos (YYYY-MM-DD) mandan sobre el modo año/rolling.
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  let desde: string, hasta: string
  if (desdeParam && hastaParam && ISO.test(desdeParam) && ISO.test(hastaParam)) {
    desde = desdeParam
    hasta = hastaParam
  } else if (rolling) {
    hasta = new Date(year, month, 0).toISOString().slice(0, 10)
    desde = new Date(year, month - 12, 1).toISOString().slice(0, 10)
  } else {
    // Año fiscal completo (coherente con /comerciantes y /movimientos, que ya usaban Ene-Dic).
    desde = `${year}-01-01`
    hasta = `${year}-12-31`
  }

  try {
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
        -- SOLO gasto PERSONAL (Alberto: "para analizar mis gastos personales, ni negocios"). Sin este
        -- filtro se colaban traspasos internos (liquidaciones TARJ.CRDTO, miles de €), gastos de negocio
        -- (turistico_*/seguros) e incluso ingresos (que SUM(ABS()) sumaba) → "Otros gasto" al 97%.
        AND COALESCE(mb.destino, 'personal') = 'personal'
        AND mb.importe < 0
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
  } catch (e) {
    console.error('[/api/finanzas/categorias]', e)
    // Nunca 500: devolvemos vacío para que la pestaña muestre estado en vez de colgarse cargando.
    return NextResponse.json({ categorias: [], sinCategoria: 0 })
  }
}
