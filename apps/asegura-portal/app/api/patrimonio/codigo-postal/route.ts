import { NextResponse } from 'next/server'

import { provinciaPorCp } from '@central/core-direccion'
import { municipiosPorCp } from '@central/core-direccion/servidor'

import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/codigo-postal?cp=41003` → `{ cp, municipios, provincia }`. Primer peldaño de la dirección
 * (CP primero). `municipios: null` = CP que la tabla no conoce (se escribe a mano), NO «ninguno». Datos públicos,
 * pero exige sesión para no ser un servicio anónimo. Porta `apps/plataforma/app/api/correduria/codigo-postal`.
 */
export async function GET(req: Request) {
  try {
    await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const cp = (new URL(req.url).searchParams.get('cp') ?? '').trim()
  if (!/^\d{5}$/.test(cp)) return NextResponse.json({ error: 'cp_invalido' }, { status: 400 })
  return NextResponse.json(
    { cp, municipios: municipiosPorCp(cp), provincia: provinciaPorCp(cp) },
    { headers: { 'cache-control': 'private, max-age=86400' } },
  )
}
