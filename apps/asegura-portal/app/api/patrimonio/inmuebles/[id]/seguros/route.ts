import { NextResponse } from 'next/server'

import { responderSegurosInmueble, segurosDeInmueble } from '@/lib/patrimonio/seguros-inmueble-api'
import { puertosSegurosInmueble } from '@/lib/patrimonio/seguros-inmueble-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/inmuebles/[id]/seguros` — estado de seguro, enlaces, propuestas y enlazables del inmueble.
 * `POST` — `{accion:'enlazar', tipo, polizaId, estado, origen?}` · `{accion:'quitar', enlaceId}` ·
 * `{accion:'sin_seguro', valor}`.
 *
 * 🚨 La identidad sale de la cookie; el inmueble se busca DENTRO de `accesosPatrimonio()` y la póliza DENTRO de lo que
 * esta identidad ve. Ajeno o sin nivel → 404 (nunca 403). Lógica en `lib/patrimonio/seguros-inmueble-api.ts`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'lectura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const { id } = await params
  const datos = await segurosDeInmueble(puertosSegurosInmueble(identidad.id), id)
  if (datos === null) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  return NextResponse.json(datos)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  // Tope en memoria por identidad (corta el bucle, no es el límite real).
  const tope = rateLimit(`patrimonio-seguros:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderSegurosInmueble(puertosSegurosInmueble(identidad.id), id, cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
