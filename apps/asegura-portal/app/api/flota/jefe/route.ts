import { NextResponse } from 'next/server'

import { nombrarJefeFlota } from '@/lib/flota'
import { requireIdentidad } from '@/lib/session'

import { ESTADO_HTTP_FLOTA } from '../estado-http'

export const runtime = 'nodejs'

/**
 * El dueño nombra jefe de flota a una persona relacionada con su sociedad.
 * Nace PENDIENTE: esa persona lo acepta (o lo rechaza) desde su `/flota`, por la
 * ruta de siempre (`POST /api/autorizaciones/[id]`). Retirarlo, igual.
 *
 * La identidad SIEMPRE sale de la cookie; `empresaId` y `candidatoId` se buscan
 * DENTRO de lo que esta identidad puede ver (`lib/flota.ts`), nunca consultan.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }
  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const r = await nombrarJefeFlota({
    identidadId: identidad.id,
    empresaId: c.empresaId,
    candidatoId: c.candidatoId,
    aceptaTexto: c.aceptaTexto,
  })
  if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP_FLOTA[r.error] })
  return NextResponse.json({ ok: true })
}
