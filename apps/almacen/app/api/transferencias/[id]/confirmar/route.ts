import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { confirmarTransferencia, actorDeSesion } from '@/lib/almacen'

const body = z.object({
  recibidas: z.number().int().min(0),
  rotas: z.number().int().min(0),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const { id } = await ctx.params
  const p = body.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const r = await confirmarTransferencia(s.id, actorDeSesion(s), id, p.data.recibidas, p.data.rotas)
    return NextResponse.json({ ok: true, estado: r.estado })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
