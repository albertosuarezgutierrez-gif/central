import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { candidatasFusion, compararParaFusion, fusionar } from '@/lib/cartera-fusion'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

// /api/operador/cliente/fusion — fusionar dos fichas de la misma persona.
//
// GET ?id=              → las otras fichas con el MISMO DNI (candidatas).
// GET ?id=&con=         → las dos fichas comparadas campo a campo.
// POST {id, con, deAbsorbida[], confirmarSinDni?, actor}
//                       → fusiona `con` en `id` (`id` es la que se queda).
//
// La escritura la hace la función de BD `fusionar_clientes` en una sola
// transacción, con lápida y registro reversible; aquí se re-compara antes
// para no fusionar con lo que la pantalla vio hace diez minutos.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const url = new URL(req.url)
    const id = (url.searchParams.get('id') ?? '').trim()
    const con = (url.searchParams.get('con') ?? '').trim()
    if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
    if (con === '') {
      const candidatas = await candidatasFusion(correduria.id, id)
      if (candidatas === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudieron buscar duplicadas' }, { status: 500 })
      return NextResponse.json({ estado: 'ok', candidatas })
    }
    const r = await compararParaFusion(correduria.id, id, con)
    const status = r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : 422
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/fusion', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const con = typeof body?.con === 'string' ? body.con.trim() : ''
    const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : ''
    if (id === '' || con === '') return NextResponse.json({ estado: 'invalido', motivo: 'Faltan las dos fichas.' }, { status: 422 })
    if (actor === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta quién fusiona.' }, { status: 422 })
    const r = await fusionar(correduria.id, id, con, body?.deAbsorbida, body?.confirmarSinDni === true, actor)
    const status = r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' ? 404 : r.estado === 'conflicto' ? 409 : 422
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/fusion', e) }, { status: 500 })
  }
})
