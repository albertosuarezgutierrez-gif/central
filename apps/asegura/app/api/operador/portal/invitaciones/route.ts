import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { censoPortal, invitarLote } from '@/lib/invitacion-portal-lote'
import { MAX_POR_LOTE } from '@/lib/lote-invitacion'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Invitación al portal POR LOTES (plataforma → asegura, Bearer).
 *
 *   GET                              → censo: a quién se escribiría, a quién no
 *                                      y por qué, y el correo tal cual saldría
 *   POST { clienteIds, actor }       → envía a esos ids (solo a los que el censo
 *                                      de ahora sigue dando como enviables)
 *
 * 🚨 Como el botón de la ficha: lo dispara Alberto con un clic, sin cron. Es la
 * regla de comunicaciones salientes del `CLAUDE.md` raíz — el clic sobre una
 * lista que ha visto es la autorización para ESE envío.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const censo = await censoPortal(correduria.id)
    return NextResponse.json({ estado: 'ok', maxPorLote: MAX_POR_LOTE, ...censo })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/portal/invitaciones', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })

    const body = (await req.json().catch(() => null)) as { clienteIds?: unknown; actor?: unknown } | null
    const clienteIds = Array.isArray(body?.clienteIds)
      ? body.clienteIds.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
      : []
    const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : null
    if (clienteIds.length === 0 || actor === null) {
      return NextResponse.json({ estado: 'invalido', motivo: 'Faltan clienteIds o actor.' }, { status: 422 })
    }
    const r = await invitarLote(correduria.id, { clienteIds, actor })
    return NextResponse.json({ estado: r.parado ? 'parado' : 'ok', ...r }, { status: r.parado ? 503 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/portal/invitaciones', e) }, { status: 500 })
  }
})
