import { NextResponse } from 'next/server'

import { anotarParteMandado } from '@/lib/parte-compania'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST { compania, conPdf } — el cliente dice que ya ha mandado ESTE parte a su compañía
 * por WhatsApp. Se anota en su ficha y se avisa a Alberto; no se comprueba nada con la
 * compañía (no podemos). La vista de corredor no llega aquí: el middleware niega escrituras.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  const b = (await req.json().catch(() => null)) as { compania?: unknown; conPdf?: unknown } | null
  const compania = typeof b?.compania === 'string' ? b.compania.trim() : ''
  if (compania === '') return NextResponse.json({ error: 'sin_compania' }, { status: 400 })

  const r = await anotarParteMandado(id, compania, b?.conPdf === true)
  if (r.estado === 'sin_sesion') return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  if (r.estado === 'no_encontrado') return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  return NextResponse.json(r)
}
