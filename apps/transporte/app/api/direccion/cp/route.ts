import { NextRequest, NextResponse } from 'next/server'
import { provinciaPorCp } from '@central/core-direccion'
import { municipiosPorCp } from '@central/core-direccion/servidor'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

// GET /api/direccion/cp?cp=41003 → { municipios, provincia }. `municipios: null` = CP que la tabla no conoce (no «ninguno»).
export async function GET(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const cp = (req.nextUrl.searchParams.get('cp') ?? '').trim()
  if (!/^\d{5}$/.test(cp)) return NextResponse.json({ error: 'cp de 5 cifras' }, { status: 400 })
  return NextResponse.json(
    { cp, municipios: municipiosPorCp(cp), provincia: provinciaPorCp(cp) },
    { headers: { 'cache-control': 'private, max-age=86400' } },
  )
}
