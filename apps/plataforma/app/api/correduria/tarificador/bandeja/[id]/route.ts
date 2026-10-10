import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { resolverTrabajoBandeja } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/bandeja/[id] { accion: 'reintentar' | 'cancelar' } — resuelve un trabajo parado.
 * La regla de estados la decide asegura (409 si no procede; idempotente). Solo precio: no emite ni contrata.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const accion = b?.accion
  if (accion !== 'reintentar' && accion !== 'cancelar') {
    return NextResponse.json({ estado: 'error', mensaje: "accion tiene que ser 'reintentar' o 'cancelar'" }, { status: 400 })
  }
  const r = await resolverTrabajoBandeja(id, accion)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
