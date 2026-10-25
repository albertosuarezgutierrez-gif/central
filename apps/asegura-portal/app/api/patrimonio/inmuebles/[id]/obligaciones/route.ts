import { NextResponse } from 'next/server'

import { fechaMadrid } from '@/lib/patrimonio/dia-madrid'
import { obligacionesDeInmueble, responderObligaciones } from '@/lib/patrimonio/obligaciones-api'
import { puertosObligaciones } from '@/lib/patrimonio/obligaciones-bd'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/patrimonio/inmuebles/[id]/obligaciones` — los recordatorios propios del inmueble.
 * `POST` — `{accion:'crear', categoria, vence, periodicidad, descripcion?}` · `{accion:'editar', obligacionId, ...}` ·
 * `{accion:'hecha', obligacionId}` · `{accion:'archivar', obligacionId}`.
 *
 * 🚨 La identidad sale de la cookie; el inmueble se busca DENTRO de `accesosPatrimonio()`. Ajeno o sin nivel → 404
 * (nunca 403). Inmueble archivado → 409 (solo lectura). Lógica en `lib/patrimonio/obligaciones-api.ts`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  const { id } = await params
  const datos = await obligacionesDeInmueble(puertosObligaciones(identidad.id), id)
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
  // Tope en memoria por identidad (corta el bucle, no es el límite real).
  const tope = rateLimit(`patrimonio-obligaciones:${identidad.id}`, 60, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const { id } = await params
  const cuerpo = await req.json().catch(() => null)
  const r = await responderObligaciones(puertosObligaciones(identidad.id), id, cuerpo, fechaMadrid(new Date()))
  return NextResponse.json(r.body, { status: r.status })
}
