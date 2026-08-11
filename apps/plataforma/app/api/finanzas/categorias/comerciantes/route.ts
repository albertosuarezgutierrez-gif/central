import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getMerchantsForCategoria } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/categorias/comerciantes?categoria=supermercado&mode=fiscal_year|rolling_12&year=2025&month=6
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const categoria = searchParams.get('categoria')
  if (!categoria) return NextResponse.json({ error: 'categoria requerida' }, { status: 400 })

  const mode = searchParams.get('mode') ?? 'fiscal_year'
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const month = parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1

  // Rango de fechas explícito de la pestaña Categorías (manda sobre year/mode si es válido).
  const ISO = /^\d{4}-\d{2}-\d{2}$/
  const desdeParam = searchParams.get('desde')
  const hastaParam = searchParams.get('hasta')

  let desde: string, hasta: string
  if (desdeParam && hastaParam && ISO.test(desdeParam) && ISO.test(hastaParam)) {
    desde = desdeParam
    hasta = hastaParam
  } else if (mode === 'rolling_12') {
    const hastaDate = new Date(year, month, 0)
    hasta = hastaDate.toISOString().slice(0, 10)
    const desdeDate = new Date(year, month - 12, 1)
    desde = desdeDate.toISOString().slice(0, 10)
  } else {
    desde = `${year}-01-01`
    hasta = `${year}-12-31`
  }

  try {
    const comerciantes = await getMerchantsForCategoria(session.id, categoria, desde, hasta, searchParams.get('banco') ?? undefined)
    return NextResponse.json({ categoria, mode, desde, hasta, comerciantes })
  } catch (e) {
    console.error('[/api/finanzas/categorias/comerciantes]', e)
    return NextResponse.json({ error: 'Error al cargar comerciantes' }, { status: 500 })
  }
}
