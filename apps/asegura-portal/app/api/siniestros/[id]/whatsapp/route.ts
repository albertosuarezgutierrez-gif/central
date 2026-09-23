import { NextResponse } from 'next/server'

import { anotarParteMandado } from '@/lib/parte-compania'

export const runtime = 'nodejs'

type Ctx = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { conPdf } — el cliente dice que ya ha mandado ESTE parte a su compañía por WhatsApp.
 * Se anota en su ficha y se avisa a Alberto; no se comprueba nada con la compañía (no podemos).
 * La compañía la pone el servidor desde el parte. La vista de corredor no llega aquí: el
 * middleware niega escrituras.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  const b = (await req.json().catch(() => null)) as { conPdf?: unknown } | null
  const r = await anotarParteMandado(id, b?.conPdf === true)
  const status = { sin_sesion: 401, no_encontrado: 404, sin_compania: 422, limite: 429, ok: 200 }[r.estado]
  return NextResponse.json(r, { status })
}
