import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { borrarGrabacion, leerGrabacion, marcarValidado } from '@/lib/tarificador-grabaciones'
import { SIN_CORREDURIA, UUID, errorBorrado, errorGrabaciones, quienEscribe } from '@/lib/tarificador-grabaciones-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** `GET /api/operador/tarificador/grabaciones/[id]` — la grabación, sus pantallas en orden y el MAPA (re-validado al leer). */
export async function GET(req: Request, ctx: Ctx) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const g = await leerGrabacion(correduria.id, id)
    if (!g) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', grabacion: g }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return errorGrabaciones('operador/tarificador/grabaciones/[id]', e)
  }
}

/**
 * `PATCH /api/operador/tarificador/grabaciones/[id]` `{ validado: boolean }` — Alberto da por bueno el mapa (o lo
 * retira). Solo con mapa y todas las pantallas analizadas (409 `sin_mapa`). Un análisis nuevo lo vuelve a quitar.
 */
export const PATCH = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as { validado?: unknown } | null
  if (typeof b?.validado !== 'boolean') return NextResponse.json({ estado: 'error', mensaje: 'validado tiene que ser true/false' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const r = await marcarValidado(correduria.id, id, b.validado, quienEscribe(req))
    if (r.estado === 'no_encontrada') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'sin_mapa') return NextResponse.json({ ...r, mensaje: 'no hay mapa completo que validar (analiza todas las pantallas antes)' }, { status: 409 })
    return NextResponse.json(r)
  } catch (e) {
    return errorGrabaciones('operador/tarificador/grabaciones/[id]', e)
  }
})

/**
 * `DELETE /api/operador/tarificador/grabaciones/[id]` — Alberto borra la grabación con sus pantallas y los HTML
 * (una transacción; ver `borrarGrabacion`). 404 si no existe; 409 si un documento lo usa otra ficha.
 */
export const DELETE = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const r = await borrarGrabacion(correduria.id, id)
    if (r.estado === 'no_encontrada') return NextResponse.json(r, { status: 404 })
    return NextResponse.json(r)
  } catch (e) {
    return errorBorrado('operador/tarificador/grabaciones/[id]', e)
  }
})
