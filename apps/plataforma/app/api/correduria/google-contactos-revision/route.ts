import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { resolverRevisionGoogleAsegura, revisionesGoogleAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/google-contactos-revision — la cola de revisión de la sincronización
 * CRM ↔ Google Contacts. Reenvía al puerto de asegura (`/api/operador/google-contactos/revision`)
 * y devuelve el MISMO status y json.
 *
 *   GET  ?despuesDe=<id>  → { estado:'ok', revisiones, siguiente, pendientes }
 *   POST { id, accion, forzar? } → el `actor` lo pone el SERVIDOR (la sesión), nunca el cuerpo.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const despuesDe = new URL(req.url).searchParams.get('despuesDe')
  const r = await revisionesGoogleAsegura(despuesDe && despuesDe.trim() !== '' ? despuesDe.trim() : null)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || typeof body.accion !== 'string') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta la revisión o la acción.' }, { status: 400 })
  }
  // Solo los campos del contrato, y el `actor` el último: no se firma con otro nombre.
  const r = await resolverRevisionGoogleAsegura({
    id: body.id, accion: body.accion, ...(body.forzar === true ? { forzar: true } : {}), actor: guarda.session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
