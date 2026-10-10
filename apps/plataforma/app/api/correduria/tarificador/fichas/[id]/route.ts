import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cambiarFichaTarificador, leerFichaTarificador } from '@/lib/tarificador-fichas-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

/** GET /api/correduria/tarificador/fichas/[id] — la ficha con cada garantía y su cita literal. */
export async function GET(_req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const r = await leerFichaTarificador(id)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

/**
 * PATCH /api/correduria/tarificador/fichas/[id] — `{ accion: 'validar' }` o `{ accion: 'editar', clave, edicion }`.
 * Asegura valida la forma (catálogo, importes) y exige actor humano (lo pone el servidor desde la sesión).
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || (b.accion !== 'validar' && b.accion !== 'editar')) {
    return NextResponse.json({ estado: 'error', mensaje: 'accion: editar | validar' }, { status: 400 })
  }
  const cuerpo = b.accion === 'validar' ? { accion: 'validar' } : { accion: 'editar', clave: b.clave, edicion: b.edicion }
  const r = await cambiarFichaTarificador(id, cuerpo)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
