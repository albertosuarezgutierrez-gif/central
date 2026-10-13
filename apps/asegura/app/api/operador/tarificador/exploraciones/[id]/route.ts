import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { hayExplorador } from '@/lib/esquema-bd'
import { leerExploracion, revisarMapa } from '@/lib/tarificador-exploraciones'
import { MENSAJE_SIN_ESQUEMA, leerCambioMapa } from '@/lib/tarificador-exploraciones-reglas'
import { UUID, quienEscribe } from '@/lib/tarificador-grabaciones-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const SIN_ESQUEMA = () => NextResponse.json({ estado: 'explorador_sin_esquema', mensaje: MENSAJE_SIN_ESQUEMA }, { status: 503 })
const SIN_CORREDURIA = () => NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
const fallo = (e: unknown) => NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/exploraciones/[id]', e) }, { status: 503 })

/** `GET …/exploraciones/[id]` — cabecera, pasos (pantalla, acciones por clave, origen, coste; SIN inventario) y el mapa re-validado. */
export async function GET(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    if (!(await hayExplorador())) return SIN_ESQUEMA()
    const d = await leerExploracion(correduria.id, id)
    if (!d) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', exploracion: d }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return fallo(e)
  }
}

/**
 * `PATCH …/exploraciones/[id]` `{ estado: 'revisado' | 'descartado' | 'borrador' }` — Alberto aprueba (o descarta) el mapa.
 * Solo cambia el estado: NO genera código. 409 si no hay mapa, la exploración sigue abierta o el mapa no valida.
 */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const c = leerCambioMapa(await req.json().catch(() => null))
  if (!c.ok) return NextResponse.json({ estado: 'error', mensaje: c.mensaje }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    if (!(await hayExplorador())) return SIN_ESQUEMA()
    const r = await revisarMapa(correduria.id, id, c.estado, quienEscribe(req))
    if (r.estado === 'no_encontrada') return NextResponse.json(r, { status: 404 })
    if (r.estado !== 'ok') return NextResponse.json(r, { status: 409 })
    return NextResponse.json(r)
  } catch (e) {
    return fallo(e)
  }
})
