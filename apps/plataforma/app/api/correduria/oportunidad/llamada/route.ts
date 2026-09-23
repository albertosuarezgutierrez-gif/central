import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { registrarLlamadaAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/oportunidad/llamada — resultado de una llamada del modo
 * llamada. POST { oportunidadId, resultado, nota?, volverEl?, motivo? }.
 * Asegura lo aplica en una transacción; el actor lo pone el servidor.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.oportunidadId !== 'string' || body.oportunidadId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta oportunidadId.' }, { status: 422 })
  }
  const r = await registrarLlamadaAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
