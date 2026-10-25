import { NextResponse } from 'next/server'

import { responderCanjear } from '@/lib/inquilino/inquilino-api'
import { puertosInquilino } from '@/lib/inquilino/inquilino-bd'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/inquilino/canjear` `{ token }` — el inquilino ACEPTA su enlace. Exige SESIÓN (identidad ya probada con el código de un
 * solo uso): el token no abre sesión. Un enlace es de un uso; no existe, anulado, gastado o caducado = la misma 404.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  // Frenan el tanteo de tokens: por identidad y por IP (en memoria, no es el límite real; el real son los 256 bits).
  const porIdentidad = rateLimit(`inquilino-canjear:${identidad.id}`, 10, 60 * 60 * 1000)
  const porIp = rateLimit(`inquilino-canjear-ip:${getIp(req)}`, 30, 60 * 60 * 1000)
  if (!porIdentidad.allowed || !porIp.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': '3600' } })
  }
  const cuerpo = (await req.json().catch(() => null)) as { token?: unknown } | null
  const r = await responderCanjear(puertosInquilino(identidad.id), cuerpo?.token)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
