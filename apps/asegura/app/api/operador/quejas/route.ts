import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { cambiarQueja, colaQuejas, registrarQueja } from '@/lib/quejas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Registro de quejas y reclamaciones del SAC.
 *
 *   GET   [?todas=1] → { estado:'ok', quejas, resumen:{abiertas,urgentes,vencidas}, informe }
 *   POST  { reclamante, canal, motivo, detalle, recibidaEl?, clienteId?, polizaId?, actor }
 *         → 201 { estado:'creada', queja } · 404 no_encontrada · 422 invalida
 *   PATCH { id, estado, respuesta?, actor } → { estado:'hecho', queja } · 404 · 409 no_permitida · 422 invalida
 *
 * La cola va ordenada por el RELOJ (vencida → urgente → en plazo) y `resumen.vencidas` es el único
 * número que autoriza a decir que hay un plazo incumplido.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const todas = new URL(req.url).searchParams.get('todas') === '1'
    return NextResponse.json(await colaQuejas(correduria.id, todas))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/quejas', e) }, { status: 500 })
  }
}

function actorDe(c: Record<string, unknown> | null): string {
  return typeof c?.actor === 'string' && c.actor.trim() ? c.actor.trim() : 'corredor'
}

const STATUS_ALTA: Record<string, number> = { creada: 201, no_encontrada: 404, invalida: 422 }
const STATUS_CAMBIO: Record<string, number> = { hecho: 200, no_encontrada: 404, no_permitida: 409, invalida: 422 }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await registrarQueja(correduria.id, cuerpo, actorDe(cuerpo))
    return NextResponse.json(r, { status: STATUS_ALTA[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/quejas', e) }, { status: 500 })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await cambiarQueja(correduria.id, cuerpo, actorDe(cuerpo))
    return NextResponse.json(r, { status: STATUS_CAMBIO[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/quejas', e) }, { status: 500 })
  }
})
