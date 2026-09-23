import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarWhatsapp } from '@/lib/oportunidad-seguimiento'

export const dynamic = 'force-dynamic'

/**
 * El corredor ha abierto el WhatsApp de seguimiento de un lead.
 *   POST { oportunidadId, actor }
 * No envía nada (lo envía él desde su teléfono): anota el contacto para que
 * cuente como intento. Idempotente en el día.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b || typeof b.oportunidadId !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta oportunidadId' }, { status: 422 })
    const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await registrarWhatsapp(correduria.id, b.oportunidadId, actor)
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', yaRegistrado: r.yaRegistrado })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidad/whatsapp', e) }, { status: 500 })
  }
}
