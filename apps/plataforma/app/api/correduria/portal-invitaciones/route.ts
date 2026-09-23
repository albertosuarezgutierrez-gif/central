import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { censoInvitacionesAsegura, invitarLoteAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * /api/correduria/portal-invitaciones — invitación al portal POR LOTES.
 *
 *   GET                  → a quién se escribiría y el correo tal cual (gratis)
 *   POST { clienteIds }  → envía. El `actor` lo pone el SERVIDOR desde la sesión
 *                          (es lo que asegura anota en el historial de cada ficha).
 *
 * Reenvía al puerto de asegura con el MISMO status y json.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await censoInvitacionesAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as { clienteIds?: unknown } | null
  const clienteIds = Array.isArray(body?.clienteIds)
    ? body.clienteIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : []
  if (clienteIds.length === 0) return NextResponse.json({ estado: 'invalido', motivo: 'Falta la lista de clientes.' }, { status: 422 })
  const r = await invitarLoteAsegura({ clienteIds, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
