import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { quitarIntervinienteAsegura } from '@/lib/intervinientes-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/intervinientes — quitar a una persona de UNA póliza.
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`DELETE /api/operador/poliza/intervinientes`) con el secreto de operador y
 * devuelve el MISMO status y json, para que la pantalla lea el contrato del
 * puerto tal cual (ok / invalido / no_encontrado / sin_configurar). En
 * particular el **409 de una línea de CIMA** llega con su motivo sin reescribir:
 * borrarla no serviría, el siguiente pull la recrea.
 *
 * Sesión de plataforma obligatoria: es la pantalla de Alberto. El `actor` (quién
 * la quitó, que queda en el historial y en el log de purga de asegura) sale de
 * la sesión, nunca del body.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const intervinienteId = typeof body?.intervinienteId === 'string' ? body.intervinienteId.trim() : ''
  if (intervinienteId === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id de la línea que se quiere quitar.' }, { status: 422 })
  }
  const motivo = typeof body?.motivo === 'string' && body.motivo.trim() !== '' ? body.motivo.trim() : undefined
  const r = await quitarIntervinienteAsegura(intervinienteId, session.email, motivo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
