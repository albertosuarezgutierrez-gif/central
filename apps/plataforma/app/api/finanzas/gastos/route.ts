import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getGastosControl } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

// GET /api/finanzas/gastos?year=&quarter= — cargos del periodo agrupados por bucket de
// deducibilidad, con la bandeja de "por revisar" delante. Alimenta la pestaña Gastos.
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const quarter = parseInt(searchParams.get('quarter') || '0') || 0
  const desde = searchParams.get('desde') ?? undefined
  const hasta = searchParams.get('hasta') ?? undefined

  try {
    const data = await getGastosControl(session.id, year, quarter, desde, hasta)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[/api/finanzas/gastos]', e)
    return NextResponse.json({ error: 'Error al cargar los gastos' }, { status: 500 })
  }
}
