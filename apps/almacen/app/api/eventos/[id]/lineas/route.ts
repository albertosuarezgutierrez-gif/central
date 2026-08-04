import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { addLinea, borrarLinea } from '@/lib/eventos'

const nueva = z.object({
  materialId: z.string().uuid(),
  espacioId: z.string().uuid(),
  cantidad: z.number().int().positive(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const { id } = await ctx.params
  const p = nueva.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const l = await addLinea(s.id, { eventoId: id, ...p.data })
    return NextResponse.json({ linea: l })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const lineaId = new URL(req.url).searchParams.get('lineaId')
  if (!lineaId) return NextResponse.json({ error: 'falta-linea' }, { status: 400 })
  try {
    await borrarLinea(s.id, lineaId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}
