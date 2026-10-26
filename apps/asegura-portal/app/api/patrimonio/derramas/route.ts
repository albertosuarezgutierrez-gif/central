import { NextResponse } from 'next/server'

import { responderAltaDerrama } from '@/lib/patrimonio/gastos-api'
import { puertosGastos } from '@/lib/patrimonio/gastos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/derramas` — alta de una derrama de la comunidad de UN titular en N cuotas (las cuotas las
 * materializa el cron como gastos `propuesto`). Nivel Gestión o Total.
 *
 * 🚨 El `titular` del cuerpo se busca DENTRO de `accesosPatrimonio()`; la comunidad y el inmueble se buscan DENTRO de ese
 * titular (la comunidad es de UN titular). Titular ajeno, comunidad ajena o nivel sin permiso: la misma 404.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-derrama:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAltaDerrama(puertosGastos(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
