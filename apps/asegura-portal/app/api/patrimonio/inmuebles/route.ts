import { NextResponse } from 'next/server'

import { responderAlta, responderLista } from '@/lib/patrimonio/inmuebles-api'
import { puertosInmuebles } from '@/lib/patrimonio/inmuebles-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/inmuebles` — los titulares y inmuebles que ve ESTA sesión.
 * `POST` — alta de un inmueble en un titular al que la sesión puede dar de alta (nivel Total).
 *
 * 🚨 La identidad sale de la cookie; el `titular` del cuerpo se busca DENTRO de `accesosPatrimonio()` y, si no está o
 * el nivel no permite el alta, 404 (nunca 403). El `titular_id` y la `correduria_id` los resuelve el servidor desde la
 * ficha. Lógica en `lib/patrimonio/inmuebles-api.ts` (probada con puertos falsos).
 */
export async function GET() {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const r = await responderLista(puertosInmuebles(identidad.id))
  return NextResponse.json(r.body, { status: r.status })
}

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  // Tope en memoria por identidad (corta el bucle, no es el límite real).
  const tope = rateLimit(`patrimonio-inmueble:${identidad.id}`, 30, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderAlta(puertosInmuebles(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
