import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { traspasarOportunidad } from '@/lib/oportunidad-traspaso'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * `POST { oportunidadId, nuevoClienteId, actor }` — «Pasar la oportunidad a…» (29/09/2026): la
 * oportunidad ABIERTA pasa a llevarla otro cliente de esta correduría, con rastro en el historial.
 * No toca figuras ni variantes. Gratis.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim() : 'plataforma'
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  const nuevoClienteId = typeof b.nuevoClienteId === 'string' ? b.nuevoClienteId.trim() : ''
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 503 })
    const r = await traspasarOportunidad(correduria.id, { oportunidadId, nuevoClienteId, actor })
    return r.ok
      ? NextResponse.json({ estado: 'ok' })
      : NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('oportunidad/traspasar', e) }, { status: 500 })
  }
})
