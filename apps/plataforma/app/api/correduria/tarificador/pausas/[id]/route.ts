import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { puertoRobustez } from '@/lib/tarificador-atascos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/pausas/[id] `{ accion: 'reanudar' }` — F2: vuelve a encender una compañía/ramo que el
 * bot cortó tras varios fallos seguidos. Idempotente en asegura.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (b?.accion !== 'reanudar') return NextResponse.json({ estado: 'error', mensaje: "accion tiene que ser 'reanudar'" }, { status: 400 })
  const r = await puertoRobustez(`pausas/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ accion: 'reanudar' }) }, undefined, 55_000)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
