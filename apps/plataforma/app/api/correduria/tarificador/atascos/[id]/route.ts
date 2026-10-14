import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { puertoRobustez } from '@/lib/tarificador-atascos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/correduria/tarificador/atascos/[id] — un atasco con su captura (PNG en base64), para la pantalla. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const r = await puertoRobustez(`atascos/${encodeURIComponent(id)}`, { method: 'GET' })
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

/**
 * POST /api/correduria/tarificador/atascos/[id] `{ accion: 'elegir', n }` | `{ accion: 'descartar' }` — la respuesta de
 * Alberto. Asegura valida el número contra la lista guardada y el estado (409 si ya no espera; idempotente). Elegir aprende
 * el elemento y el bot repite el presupuesto: solo precio, nunca contrata.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const cuerpo = b?.accion === 'descartar'
    ? { accion: 'descartar' }
    : b?.accion === 'elegir' && typeof b.n === 'number' && Number.isInteger(b.n) && b.n >= 1 && b.n <= 20
      ? { accion: 'elegir', n: b.n }
      : null
  if (!cuerpo) return NextResponse.json({ estado: 'error', mensaje: "{ accion: 'elegir', n: 1..20 } o { accion: 'descartar' }" }, { status: 400 })
  const r = await puertoRobustez(`atascos/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(cuerpo) }, undefined, 55_000)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
