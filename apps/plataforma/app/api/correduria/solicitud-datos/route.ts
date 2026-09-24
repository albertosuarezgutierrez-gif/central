import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { accionSolicitudDatosAsegura, interpretarSolicitudesDatos, solicitudesDatosAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/solicitud-datos — el enlace para que el cliente complete sus datos
 * (24/09/2026). Reenvía al puerto de asegura; el `actor` lo pone el servidor.
 *   GET  ?oportunidadId=              → sus solicitudes (con respuestas)
 *   POST { oportunidadId }            → crea el enlace (url + mensaje solo al crearlo)
 *   POST { accion:'anular', id }      → el enlace deja de funcionar
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('oportunidadId') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'Falta la oportunidad.' }, { status: 422 })
  const r = await solicitudesDatosAsegura(id)
  return NextResponse.json(interpretarSolicitudesDatos(r.status, r.json))
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const cuerpo = b?.accion === 'anular'
    ? { accion: 'anular', id: typeof b.id === 'string' ? b.id : '' }
    : { oportunidadId: typeof b?.oportunidadId === 'string' ? b.oportunidadId : '', actor: guarda.session.email }
  const r = await accionSolicitudDatosAsegura(cuerpo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
