import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { cerrarInventario } from '@/lib/inventario'
import { actorDeSesion } from '@/lib/almacen'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const { id } = await ctx.params
  try {
    const r = await cerrarInventario(s.id, actorDeSesion(s), id)
    return NextResponse.json({ ok: true, ajustes: r.ajustes })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
