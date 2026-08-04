import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { devolverEvento } from '@/lib/eventos'
import { actorDeSesion } from '@/lib/almacen'

const body = z.object({
  devoluciones: z.array(z.object({
    lineaId: z.string().uuid(),
    buenas: z.number().int().min(0),
    rotas: z.number().int().min(0),
  })),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const { id } = await ctx.params
  const p = body.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const r = await devolverEvento(s.id, actorDeSesion(s), id, p.data.devoluciones)
    return NextResponse.json({ ok: true, cerrado: r.cerrado })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
