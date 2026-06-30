import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getPLMensual, mesPorDefecto } from '@/lib/sivra/pl-mensual'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const mes = req.nextUrl.searchParams.get('mes') ?? mesPorDefecto()
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Formato de mes inválido (YYYY-MM)' }, { status: 400 })
  }

  try {
    const data = await getPLMensual(mes)
    return NextResponse.json(data)
  } catch (err) {
    console.error('[pl-mensual]', err)
    return NextResponse.json({ error: 'Error calculando P&L' }, { status: 500 })
  }
}
