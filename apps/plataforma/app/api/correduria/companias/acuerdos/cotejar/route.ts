import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cotejarAcuerdoAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/**
 * POST /api/correduria/companias/acuerdos/cotejar `{ acuerdoId }` — «Coincide con
 * el PDF». asegura sella `revisado_at` (auditado, con el actor de la sesión).
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const acuerdoId = typeof body?.acuerdoId === 'string' ? body.acuerdoId : null
  if (!acuerdoId) return NextResponse.json({ estado: 'invalido', error: '{ acuerdoId }' }, { status: 400 })
  const r = await cotejarAcuerdoAsegura(acuerdoId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
