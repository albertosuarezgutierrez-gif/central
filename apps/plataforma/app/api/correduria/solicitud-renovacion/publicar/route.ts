import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { publicarSolicitudRenovacionAsegura } from '@/lib/solicitud-renovacion-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { solicitudId } — «Enviar al cliente por la app» (05/11/2026): el MISMO ✅ que el del Telegram, desde la ficha de la
 * póliza. Sale a un tercero: solo con la sesión de la correduría y por pulsación. 503 `canal_no_disponible` = nadie que pueda
 * contestar usa la app ≠ 502 (fallo). El `actor` lo pone el servidor.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
  if (!UUID.test(solicitudId)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id de la solicitud.' }, { status: 422 })
  const r = await publicarSolicitudRenovacionAsegura({ solicitudId, actor: guarda.session.email, via: 'pantalla' })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
