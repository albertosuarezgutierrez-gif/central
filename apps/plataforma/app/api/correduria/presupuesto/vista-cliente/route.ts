import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { vistaPresupuestoAsegura } from '@/lib/portal-cliente-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * «Ver como el cliente» un presupuesto (18/10/2026), también un BORRADOR sin enviar. Solo sesión de la correduría;
 * asegura crea la vista de corredor (un uso, 10 min) sobre la ficha DEL PRESUPUESTO y el portal la abre en solo
 * lectura. No envía nada, no marca visto/enviado. El `actor` lo pone el servidor desde la sesión, el último.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof body?.presupuestoId === 'string' ? body.presupuestoId.trim() : ''
  if (!UUID.test(presupuestoId)) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del presupuesto.' }, { status: 422 })
  }
  const r = await vistaPresupuestoAsegura({ presupuestoId, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
