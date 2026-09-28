import { NextRequest, NextResponse } from 'next/server'
import { provinciaPorCp } from '@central/module-seguros'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { municipiosPorCp } from '@/lib/codigo-postal'

// GET /api/correduria/codigo-postal?cp=41011 → { municipios, provincia }.
// `municipios: null` = CP que la tabla no conoce (se escribe a mano), no «ninguno».
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cp = (req.nextUrl.searchParams.get('cp') ?? '').trim()
  if (!/^\d{5}$/.test(cp)) return NextResponse.json({ error: 'cp de 5 cifras' }, { status: 400 })
  return NextResponse.json(
    { cp, municipios: municipiosPorCp(cp), provincia: provinciaPorCp(cp) },
    { headers: { 'cache-control': 'private, max-age=86400' } },
  )
}
