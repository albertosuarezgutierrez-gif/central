import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { revisarBorradorEntrante, revisarSelectorBorrador } from '@/lib/borrador-presupuesto-reglas'
import { borrarBorradorPresupuesto, guardarBorradorPresupuesto, leerBorradores } from '@/lib/borrador-presupuesto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Borrador de una pantalla de presupuesto, en servidor (05/10/2026). No es oportunidad ni cartera.
 *   GET    ?clienteId=&ramo=                          → { borradores: [{ oportunidadId, datos, guardadoEn }] }
 *   POST   { clienteId, oportunidadId?, ramo, datos, guardadoEn, actor } → guarda (no pisa uno más reciente)
 *   DELETE ?clienteId=&ramo=&oportunidadId=           → al pagar con éxito
 * Sin tabla (migración sin aplicar) o sin BD: 503, y la pantalla sigue con su copia local.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const q = new URL(req.url).searchParams
    const sel = revisarSelectorBorrador(q.get('clienteId'), q.get('ramo'))
    if (!sel.ok) return NextResponse.json({ estado: 'invalido', motivo: sel.motivo }, { status: 422 })
    const borradores = await leerBorradores(correduria.id, sel.valor.clienteId, sel.valor.ramo)
    return NextResponse.json({ estado: 'ok', borradores }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/borrador-presupuesto', e) }, { status: 503 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = revisarBorradorEntrante(await req.json().catch(() => null))
    if (!r.ok) return NextResponse.json({ estado: 'invalido', motivo: r.motivo }, { status: 422 })
    const g = await guardarBorradorPresupuesto(correduria.id, r.valor)
    if (!g.ok) return NextResponse.json(g, { status: g.status })
    return NextResponse.json({ estado: 'ok', guardadoEn: g.guardadoEn, aplicado: g.aplicado })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/borrador-presupuesto', e) }, { status: 503 })
  }
})

export const DELETE = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const q = new URL(req.url).searchParams
    const sel = revisarSelectorBorrador(q.get('clienteId'), q.get('ramo'), q.get('oportunidadId'))
    if (!sel.ok) return NextResponse.json({ estado: 'invalido', motivo: sel.motivo }, { status: 422 })
    const n = await borrarBorradorPresupuesto(correduria.id, sel.valor.clienteId, sel.valor.ramo, sel.valor.oportunidadId)
    return NextResponse.json({ estado: 'ok', borrados: n })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/borrador-presupuesto', e) }, { status: 503 })
  }
})
