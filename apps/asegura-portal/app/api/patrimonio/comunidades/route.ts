import { NextResponse } from 'next/server'

import { responderAltaComunidad } from '@/lib/patrimonio/gastos-api'
import { puertosGastos } from '@/lib/patrimonio/gastos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/comunidades` — alta de la comunidad de propietarios de UN titular y enlace de sus inmuebles
 * (con coeficiente opcional; vacío = no consta). Estructura: solo nivel Total (`alta_baja`).
 *
 * 🚨 El `titular` se busca DENTRO de `accesosPatrimonio()`; los inmuebles, DENTRO de ese titular (si falta alguno, 404 y
 * no se crea nada). Una comunidad nunca se comparte entre titulares.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const tope = rateLimit(`patrimonio-comunidad:${identidad.id}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAltaComunidad(puertosGastos(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
