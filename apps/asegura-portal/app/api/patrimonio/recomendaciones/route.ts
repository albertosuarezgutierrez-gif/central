import { NextResponse } from 'next/server'

import { responderCrearRecomendacion, responderListarRecomendaciones } from '@/lib/patrimonio/recomendacion-api'
import { puertosRecomendacion } from '@/lib/patrimonio/recomendacion-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/recomendaciones` — «Invita a otro propietario». Cuerpo: `{ correo }`. Registra la recomendación (solo el
 * HASH del correo) y NO envía nada: la pantalla compone el texto que la persona copia o comparte ella. `GET` lista las suyas
 * (sin correo) y hasta cuándo dura su recompensa. Sin acceso a patrimonio: 404.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-recomendacion:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderCrearRecomendacion(puertosRecomendacion(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const r = await responderListarRecomendaciones(puertosRecomendacion(identidad.id))
  return NextResponse.json(r.body, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
