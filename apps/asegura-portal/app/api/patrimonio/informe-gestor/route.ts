import { NextResponse } from 'next/server'

import { csvGestor } from '@/lib/patrimonio/informe-gestor'
import { informeGestorDeIdentidad } from '@/lib/patrimonio/informe-gestor-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/informe-gestor?anio=&titular=` — CSV del informe anual para el gestor (P7, 27/10/2026). 🚨 La identidad
 * sale SOLO de la cookie y todo parte de `informeGestorDeIdentidad` (→ `accesosPatrimonio`): un `titular` que no es de esta
 * identidad = 404 (nunca 403); lectura fallida = 500 (jamás un CSV con ceros).
 */
export async function GET(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-informe-gestor-csv:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  try {
    const q = new URL(req.url).searchParams
    const r = await informeGestorDeIdentidad(identidad.id, q.get('anio'), q.get('titular'))
    if (r.kind !== 'ok') return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
    return new NextResponse(csvGestor(r.informe), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="informe-gestor-${r.informe.anio}.csv"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('[patrimonio/informe-gestor csv]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }
}
