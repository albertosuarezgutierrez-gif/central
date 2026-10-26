import { NextResponse } from 'next/server'

import { esUuid } from '@/lib/patrimonio/cubre-seguro'
import { descartarAvisoCubre } from '@/lib/patrimonio/cubre-seguro-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/cubre-seguro` `{ gasto }` — «no me interesa este aviso»: se recuerda en `portal_aviso_leido`.
 * 🚨 La identidad sale SOLO de la cookie; el gasto se busca DENTRO de los avisos visibles de esa identidad (ajeno o
 * inexistente = la misma 404). No toca el gasto ni el seguro.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-cubre-seguro:${identidad.id}`, 120, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = (await req.json().catch(() => null)) as { gasto?: unknown } | null
  if (!esUuid(cuerpo?.gasto)) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  try {
    const r = await descartarAvisoCubre(cuerpo.gasto)
    if (r === 'sin_sesion') return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
    if (r === 'no_encontrado') return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[patrimonio/cubre-seguro]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }
}
