import { NextResponse } from 'next/server'

import { responderAltaPlantilla, responderListaGastos } from '@/lib/patrimonio/gastos-api'
import { puertosGastos } from '@/lib/patrimonio/gastos-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/plantillas` — plantillas de gasto fijo, comunidades y derramas de los titulares que ve ESTA sesión.
 * `POST` — alta de una plantilla en un titular donde el nivel permite gestionar gastos (Gestión o Total).
 *
 * 🚨 La identidad sale de la cookie; el `titular` del cuerpo se busca DENTRO de `accesosPatrimonio()` y, si no está o el
 * nivel no alcanza, 404 (nunca 403). El `titular_id` lo resuelve el servidor; el inmueble se busca dentro del titular.
 * Importe vacío = variable (null), nunca 0. Lógica en `lib/patrimonio/gastos-api.ts` (probada con puertos falsos).
 */
export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const r = await responderListaGastos(puertosGastos(identidad.id))
  return NextResponse.json(r.body, { status: r.status })
}

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-plantilla:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAltaPlantilla(puertosGastos(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
