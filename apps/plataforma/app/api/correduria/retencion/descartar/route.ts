import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { descartarRetencionAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/retencion/descartar — quita una póliza de "Hay que
 * llamar" un número de días. NO la resuelve: reaparece sola si el recibo
 * sigue sin cobrar al caducar el plazo (ver `lib/cartera-impagados.ts` de
 * asegura). El `actor` lo pone el servidor: un descarte queda anotado en el
 * historial de la ficha y tiene que constar quién lo pidió.
 */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof body?.polizaId === 'string' ? body.polizaId : null
  if (!polizaId) return NextResponse.json({ estado: 'error', motivo: 'falta polizaId' }, { status: 400 })
  const motivo = typeof body?.motivo === 'string' ? body.motivo : null
  const dias = typeof body?.dias === 'number' ? body.dias : undefined

  const r = await descartarRetencionAsegura(polizaId, session.email, motivo, dias)
  const status = r.estado === 'ok' ? 200 : r.estado === 'sin_configurar' ? 503 : 502
  return NextResponse.json(r, { status })
}
