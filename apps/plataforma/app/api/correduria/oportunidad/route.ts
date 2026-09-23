import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { accionOportunidadAsegura, interpretarOportunidad, oportunidadAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/oportunidad — seguimiento de una oportunidad. Reenvía al
 * puerto de asegura, que valida la regla (perder sin motivo = 422) y deja el
 * historial. El `actor` lo pone el servidor y va el ÚLTIMO: el cliente no
 * puede firmar con otro nombre.
 *   GET  ?id=
 *   POST { id, accion, motivo?, detalle?, competidor?, primaCompetidor?, aparcadaHasta?, polizaGanadaId? }
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'Falta el id.' }, { status: 422 })
  const r = await oportunidadAsegura(id)
  return NextResponse.json(interpretarOportunidad(r.status, r.json))
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || typeof body.accion !== 'string') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan id y accion.' }, { status: 422 })
  }
  const r = await accionOportunidadAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
