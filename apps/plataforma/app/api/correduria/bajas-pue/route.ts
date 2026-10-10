import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { bajasPuePendientes, marcarBajaTramitada } from '@/lib/correduria/bajas-pue'

export const dynamic = 'force-dynamic'

/** GET — bajas de Allianz pendientes de tramitar en el PUE. `error` ≠ «no hay ninguna». */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await bajasPuePendientes())
}

/** POST { anulacionId } — «ya la he tramitado en el PUE». El actor sale de la SESIÓN, nunca del cuerpo. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const anulacionId = typeof b?.anulacionId === 'string' ? b.anulacionId.trim() : ''
  if (!anulacionId) return NextResponse.json({ estado: 'invalida', motivo: 'falta anulacionId' }, { status: 422 })
  const r = await marcarBajaTramitada(anulacionId, guarda.session.email)
  return NextResponse.json(r.json, { status: r.status })
}
