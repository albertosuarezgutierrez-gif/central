import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getResumenFinanciero } from '@/lib/finanzas'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
  const quarter = parseInt(searchParams.get('quarter') || '0') || 0

  try {
    const data = await getResumenFinanciero(session.id, year, quarter)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[/api/finanzas]', e)
    return NextResponse.json({ error: 'Error al cargar datos financieros' }, { status: 500 })
  }
}
