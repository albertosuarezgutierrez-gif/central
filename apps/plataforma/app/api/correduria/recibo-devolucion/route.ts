import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { bajaPorDevolucionAsegura, resolverDevolucionAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/recibo-devolucion — «cobrado de nuevo» a mano sobre un recibo que la compañía avisó
 * por correo que estaba devuelto. Reenvía al puerto de asegura; el `actor` lo pone el servidor.
 *   PATCH { reciboId }                          → cobrado de nuevo
 *   PATCH { reciboId, accion:'baja', motivo, nota? } → el cliente se va (póliza anulada + oportunidad)
 */
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.reciboId !== 'string' || body.reciboId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el recibo.' }, { status: 400 })
  }
  if (body.accion === 'baja') {
    if (typeof body.motivo !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el motivo.' }, { status: 400 })
    const nota = typeof body.nota === 'string' && body.nota.trim() !== '' ? body.nota.trim().slice(0, 500) : null
    const b = await bajaPorDevolucionAsegura(body.reciboId.trim(), body.motivo, nota, guarda.session.email)
    if (b.estado === 'ok') return NextResponse.json(b)
    if (b.estado === 'sin_configurar') return NextResponse.json({ estado: 'sin_configurar', motivo: 'Falta ASEGURA_OPERADOR_SECRET.' }, { status: 503 })
    if (b.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: b.motivo }, { status: 409 })
    return NextResponse.json({ estado: 'sin_respuesta', motivo: b.motivo }, { status: 502 })
  }
  const r = await resolverDevolucionAsegura(body.reciboId.trim(), guarda.session.email)
  if (r.estado === 'ok') return NextResponse.json({ estado: 'ok' })
  if (r.estado === 'sin_configurar') return NextResponse.json({ estado: 'sin_configurar', motivo: 'Falta ASEGURA_OPERADOR_SECRET.' }, { status: 503 })
  return NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: 502 })
}
