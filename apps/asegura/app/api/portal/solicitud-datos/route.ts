import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { responderSolicitud, solicitudPorToken } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * El enlace de datos del cliente, visto desde el portal (24/09/2026). Por TOKEN y sin identidad
 * (decisión de Alberto: enlace directo). Lo que devuelve NO lleva nada del cliente: el ramo y los
 * campos a pedir. Enlace inexistente, anulado o caducado → la misma respuesta («muerta»).
 *   GET  ?token=                → { estado, ramo?, campos? }
 *   POST { token, respuestas }  → 200 ok · 422 errores por campo · 410 muerta/completada
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const token = (new URL(req.url).searchParams.get('token') ?? '').trim()
    const r = await solicitudPorToken(token)
    return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-datos', e) }, { status: 503 })
  }
}

export async function POST(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const token = typeof b?.token === 'string' ? b.token.trim() : ''
    const respuestas = b?.respuestas && typeof b.respuestas === 'object' && !Array.isArray(b.respuestas) ? (b.respuestas as Record<string, unknown>) : {}
    const r = await responderSolicitud(token, respuestas)
    if (r.ok) return NextResponse.json({ estado: 'ok' })
    return NextResponse.json(r, { status: r.estado === 'errores' ? 422 : 410 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-datos', e) }, { status: 503 })
  }
}
