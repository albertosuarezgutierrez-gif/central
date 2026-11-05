import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { prepararSolicitudRenovacionAsegura } from '@/lib/solicitud-renovacion-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { polizaId } — «Pedir datos al cliente por la app» (05/11/2026). Gratis: Catastro + las preguntas que el bot de hogar
 * echa en falta; deja la solicitud SIN publicar y asegura manda el Telegram de revisión (✅ / ✏️). NO sale nada al cliente.
 * El `actor` lo pone el servidor.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof body?.polizaId === 'string' ? body.polizaId.trim() : ''
  if (!UUID.test(polizaId)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id de la póliza.' }, { status: 422 })
  const r = await prepararSolicitudRenovacionAsegura({ polizaId, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
