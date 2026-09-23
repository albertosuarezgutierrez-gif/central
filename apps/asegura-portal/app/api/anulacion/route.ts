import { NextResponse } from 'next/server'
import { normalizarIp, normalizarUserAgent } from '@central/module-seguros-portal'

import { firmar, pedirCodigo } from '@/lib/anulacion-firma'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/anulacion — el cliente firma su anulación (pieza 2-d-2).
 *   { accion: 'codigo', anulacionId }                 → código de 6 cifras a su correo
 *   { accion: 'firmar', anulacionId, codigo, nombre } → firma la carta
 *
 * La identidad sale de la SESIÓN, nunca del cuerpo. 🚨 La vista de corredor
 * es de solo lectura: Alberto no firma una anulación por el cliente (403).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const anulacionId = typeof b?.anulacionId === 'string' ? b.anulacionId.trim() : ''
  if (!b || anulacionId === '') return NextResponse.json({ estado: 'no_disponible', motivo: 'Falta la anulación.' }, { status: 422 })

  if (b.accion === 'codigo') {
    const r = await pedirCodigo(identidad.id, anulacionId)
    const status = r.estado === 'codigo_enviado' ? 200 : r.estado === 'espera' ? 429 : r.estado === 'no_disponible' ? 409 : 502
    return NextResponse.json(r, { status })
  }
  if (b.accion === 'firmar') {
    const codigo = typeof b.codigo === 'string' ? b.codigo.trim() : ''
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : ''
    if (!/^\d{6}$/.test(codigo) || nombre === '') {
      return NextResponse.json({ estado: 'reintentar', motivo: 'Revisa el código (6 cifras) y tu nombre.' }, { status: 422 })
    }
    const r = await firmar(identidad.id, anulacionId, {
      codigo, nombre,
      ip: normalizarIp(req.headers.get('x-forwarded-for')),
      userAgent: normalizarUserAgent(req.headers.get('user-agent')),
    })
    const status = r.estado === 'firmada' ? 200 : r.estado === 'reintentar' ? 422 : r.estado === 'no_disponible' ? 409 : 502
    return NextResponse.json(r, { status })
  }
  return NextResponse.json({ estado: 'no_disponible', motivo: 'Acción desconocida.' }, { status: 422 })
}
