import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { publicarRenovacionAsegura } from '@/lib/renovacion-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { presupuestoId } — «Enviar al cliente por la app» (04/11/2026): el MISMO ✅ que el del Telegram, desde la ficha.
 * Sale a un tercero: solo con la sesión de la correduría y por pulsación. 503 `canal_no_disponible` = el tomador no usa
 * la app (no hay a quién) ≠ 502 (fallo). El `actor` lo pone el servidor.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof body?.presupuestoId === 'string' ? body.presupuestoId.trim() : ''
  if (!UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del presupuesto.' }, { status: 422 })
  const r = await publicarRenovacionAsegura({ presupuestoId, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
