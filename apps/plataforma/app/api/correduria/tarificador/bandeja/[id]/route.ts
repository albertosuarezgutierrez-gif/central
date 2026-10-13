import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { resolverTrabajoBandeja } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/bandeja/[id] { accion: 'reintentar' | 'cancelar', eleccionVersion?: { codigo, etiqueta? } }
 * — resuelve un trabajo parado. `eleccionVersion` (solo reintentar): la versión del vehículo elegida a mano.
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
  // Versión elegida a mano (solo forma aquí; la lista y el estado los valida asegura bajo su `for update`).
  let eleccionVersion: { codigo: string; etiqueta?: string | null } | null = null
  const ev = b?.eleccionVersion
  if (ev !== undefined && ev !== null) {
    const o = typeof ev === 'object' && !Array.isArray(ev) ? (ev as Record<string, unknown>) : null
    const etiqueta = o?.etiqueta
    if (accion !== 'reintentar' || !o || typeof o.codigo !== 'string' || !o.codigo.trim() || o.codigo.length > 60
      || (etiqueta !== undefined && etiqueta !== null && (typeof etiqueta !== 'string' || etiqueta.length > 200))) {
      return NextResponse.json({ estado: 'error', mensaje: 'eleccionVersion: { codigo, etiqueta? } y solo con reintentar' }, { status: 400 })
    }
    eleccionVersion = { codigo: o.codigo.trim(), etiqueta: typeof etiqueta === 'string' ? etiqueta : null }
  }
  const r = await resolverTrabajoBandeja(id, accion, eleccionVersion)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
