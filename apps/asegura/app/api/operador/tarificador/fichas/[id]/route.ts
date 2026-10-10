import { NextResponse } from 'next/server'
import { validarEdicionGarantia } from '@central/module-tarificacion'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { editarGarantiaFicha, leerFicha, validarFicha, SinTablaFichasError } from '@/lib/tarificador-fichas'
import { MENSAJE_SIN_TABLA, esUuid } from '@/lib/tarificador-fichas-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const sinTabla = () => NextResponse.json({ estado: 'sin_tabla', mensaje: MENSAJE_SIN_TABLA }, { status: 503 })

/** `GET /api/operador/tarificador/fichas/[id]` — la ficha con cada garantía, su cita, avisos y los presupuestos. */
export async function GET(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!esUuid(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const f = await leerFicha(correduria.id, id)
    if (!f) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })
    return NextResponse.json({ ficha: f }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    if (e instanceof SinTablaFichasError) return sinTabla()
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/fichas/id', e) }, { status: 503 })
  }
}

/**
 * `PATCH /api/operador/tarificador/fichas/[id]` — `{ accion: 'editar', clave, edicion: { estado, limite,
 * franquicia, notas } }` (la ficha vuelve a `pendiente`) o `{ accion: 'validar' }` (la firma con el actor).
 * Editar y validar lo hace una persona: exige actor humano.
 */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!esUuid(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  if (actor.tipo !== 'humano') return NextResponse.json({ estado: 'error', mensaje: 'editar o validar una ficha lo hace una persona' }, { status: 403 })
  const firma = `humano:${actor.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    if (b.accion === 'validar') {
      const r = await validarFicha(correduria.id, id, firma)
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 404 })
    }
    if (b.accion === 'editar') {
      const f = await leerFicha(correduria.id, id)
      if (!f) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })
      const v = validarEdicionGarantia(f.ramo, b.clave, b.edicion)
      if (!v.ok) return NextResponse.json({ estado: 'error', mensaje: v.motivo }, { status: 400 })
      const r = await editarGarantiaFicha(correduria.id, id, v.clave, v.edicion)
      return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 404 })
    }
    return NextResponse.json({ estado: 'error', mensaje: 'accion: editar | validar' }, { status: 400 })
  } catch (e) {
    if (e instanceof SinTablaFichasError) return sinTabla()
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/fichas/id:patch', e) }, { status: 503 })
  }
})
