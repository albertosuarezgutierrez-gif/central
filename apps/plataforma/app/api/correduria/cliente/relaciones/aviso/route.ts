import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { avisarAccesoAsegura } from '@/lib/relaciones-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/relaciones/aviso — escribe al relacionado para que
 * confirme el acceso que la ficha le ha dado.
 *
 * Reenvía al puerto de asegura y devuelve el MISMO status y json, para que la
 * pantalla lea su contrato tal cual (`ok` / `sin_pendiente` / `sin_email` /
 * `sin_portal` / `error_envio`). El destinatario NO viaja en el body: lo saca
 * asegura de la ficha autorizada — si viniera de aquí, esto sería un relay de
 * correo con la firma de la correduría.
 *
 * El `actor` sale de la sesión, nunca del body: queda en el historial de las dos
 * fichas quién le escribió a un tercero.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  if (typeof body.relacionadoId !== 'string' || body.relacionadoId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente relacionado.' }, { status: 422 })
  }
  if (body.relacionadoId === body.clienteId) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Una ficha no puede avisarse a sí misma.' }, { status: 422 })
  }
  const r = await avisarAccesoAsegura({
    clienteId: body.clienteId.trim(),
    relacionadoId: body.relacionadoId.trim(),
    actor: session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
