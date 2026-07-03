// apps/plataforma/app/api/contable/accion/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { ejecutarAccion, descartarAccion } from '@/lib/contable/acciones'

export const maxDuration = 20
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const accionId = typeof body?.accionId === 'string' && /^\d+$/.test(body.accionId) ? body.accionId : ''
  if (!accionId) return NextResponse.json({ error: 'accionId requerido' }, { status: 400 })

  if (body?.op === 'descartar') {
    await descartarAccion(session.id, accionId)
    return NextResponse.json({ ok: true, estado: 'descartada' })
  }
  const r = await ejecutarAccion(session.id, accionId)
  return NextResponse.json({ ok: r.ok, mensaje: r.mensaje, estado: r.ok ? 'ejecutada' : 'error' })
}
