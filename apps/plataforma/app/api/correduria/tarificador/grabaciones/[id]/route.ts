import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { borrarGrabacionAsegura, leerGrabacionAsegura, validarGrabacionAsegura } from '@/lib/tarificador-grabaciones-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

/** GET — la grabación, sus pantallas y el mapa. */
export async function GET(_req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const r = await leerGrabacionAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

/** PATCH { validado: boolean } — Alberto valida (o retira) el mapa. */
export async function PATCH(req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as { validado?: unknown } | null
  if (typeof b?.validado !== 'boolean') return NextResponse.json({ estado: 'error', mensaje: 'validado tiene que ser true/false' }, { status: 400 })
  const r = await validarGrabacionAsegura(id, b.validado)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}

/** DELETE — Alberto borra la grabación con sus pantallas (no se puede deshacer). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const r = await borrarGrabacionAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
