import { NextResponse } from 'next/server'

import { enviarDatosRenovacion } from '@/lib/datos-renovacion'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/datos-renovacion { solicitudId, respuestas } — contesta la solicitud de datos de la renovación (05/11/2026). CON
 * sesión: la identidad sale de la cookie (nunca del cuerpo). Asegura decide si esta persona puede contestar (tomador que opera o
 * autorizado Gestión/Total; si no, 404), valida contra los campos aprobados y guarda cifrado. La vista de corredor no llega aquí
 * (el middleware veta su POST).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!rateLimit(`datos-renovacion:${identidad.id}`, 10).allowed) return NextResponse.json({ error: 'demasiados_intentos' }, { status: 429 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const solicitudId = typeof b?.solicitudId === 'string' ? b.solicitudId.trim() : ''
  const r = await enviarDatosRenovacion(solicitudId, b?.respuestas ?? {})
  if (!r) return NextResponse.json({ error: 'sin_puente' }, { status: 503 })
  return NextResponse.json(r.json ?? { error: `HTTP ${r.status}` }, { status: r.status })
}
