import { NextResponse } from 'next/server'

import { provinciaPorCp } from '@central/core-direccion'
import { municipiosPorCp } from '@central/core-direccion/servidor'

import { getIp, rateLimit } from '@/lib/rate-limit'
import { tokenSolicitudVivo } from '@/lib/solicitud-datos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/datos/codigo-postal?token=&cp=41003` → `{ cp, municipios, provincia }` (25/10/2026). El primer peldaño de
 * la dirección (CP primero) en el ENLACE de datos, que no tiene sesión: lo protege un token de solicitud VIVO y un tope
 * por IP. Misma respuesta que `/api/patrimonio/codigo-postal`: `municipios: null` = CP que la tabla no conoce (se
 * escribe a mano), NO «ninguno».
 */
export async function GET(req: Request) {
  if (!rateLimit(`datos-cp:${getIp(req)}`, 60, 10 * 60 * 1000).allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const p = new URL(req.url).searchParams
  if (!(await tokenSolicitudVivo((p.get('token') ?? '').trim()))) return NextResponse.json({ error: 'enlace_no_valido' }, { status: 410 })
  const cp = (p.get('cp') ?? '').trim()
  if (!/^\d{5}$/.test(cp)) return NextResponse.json({ error: 'cp_invalido' }, { status: 400 })
  return NextResponse.json(
    { cp, municipios: municipiosPorCp(cp), provincia: provinciaPorCp(cp) },
    { headers: { 'cache-control': 'private, max-age=86400' } },
  )
}
