import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { datosVehiculoAsegura, riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'

export const dynamic = 'force-dynamic'

/** GET ?id= — el riesgo entero (figuras, vínculos, variantes P1…Pn) para su pantalla. */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'Falta el id.' }, { status: 422 })
  const r = await riesgoAsegura(id)
  return NextResponse.json(interpretarRiesgo(r.status, r.json))
}

/**
 * PATCH { oportunidadId, datosVehiculo: {…parcial…}, confirmar?: boolean } — edita y/o confirma los
 * datos del vehículo del riesgo (auto/moto). Reenvía al puerto de asegura; el `actor` lo pone el
 * servidor y va el ÚLTIMO (nada del navegador puede suplantarlo).
 */
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.oportunidadId !== 'string' || typeof body.datosVehiculo !== 'object' || body.datosVehiculo === null) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Faltan oportunidadId y datosVehiculo.' }, { status: 422 })
  }
  const r = await datosVehiculoAsegura({
    oportunidadId: body.oportunidadId,
    datosVehiculo: body.datosVehiculo,
    ...(typeof body.confirmar === 'boolean' ? { confirmar: body.confirmar } : {}),
    actor: guarda.session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
