import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerTrazaTarificador } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/correduria/tarificador/trabajo/[id]/traza — pasos del bot en ese trabajo (duración, error) y versión del bot. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const r = await leerTrazaTarificador(id)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}
