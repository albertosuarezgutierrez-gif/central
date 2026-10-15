import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { resolverTrabajoBandeja } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/bandeja/[id] { accion: 'reintentar' | 'cancelar', eleccionVersion?: { codigo, etiqueta? }, eleccionPoblacion?: string }
 * — resuelve un trabajo parado. `eleccionVersion` (solo reintentar): la versión del vehículo elegida a mano.
 * `eleccionPoblacion` (solo reintentar, 13/10/2026): la población del CP elegida a mano (texto de la lista del trabajo).
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
  // Sin código (portal sin código de catálogo, p. ej. Mapfre): `{ codigo: null, etiqueta }` con la etiqueta exacta de la opción.
  let eleccionVersion: { codigo: string | null; etiqueta?: string | null } | null = null
  const ev = b?.eleccionVersion
  if (ev !== undefined && ev !== null) {
    const o = typeof ev === 'object' && !Array.isArray(ev) ? (ev as Record<string, unknown>) : null
    const etiqueta = o?.etiqueta
    const sinCodigo = o !== null && (o.codigo === null || o.codigo === undefined)
    const codigoOk = o !== null && typeof o.codigo === 'string' && o.codigo.trim() !== '' && o.codigo.length <= 60
    const etiquetaOk = etiqueta === undefined || etiqueta === null || (typeof etiqueta === 'string' && etiqueta.length <= 200)
    const etiquetaLlena = typeof etiqueta === 'string' && etiqueta.trim() !== ''
    if (accion !== 'reintentar' || !o || !etiquetaOk || !(codigoOk || (sinCodigo && etiquetaLlena))) {
      return NextResponse.json({ estado: 'error', mensaje: 'eleccionVersion: { codigo, etiqueta? } (o { codigo: null, etiqueta }) y solo con reintentar' }, { status: 400 })
    }
    eleccionVersion = { codigo: codigoOk ? (o.codigo as string).trim() : null, etiqueta: typeof etiqueta === 'string' ? etiqueta : null }
  }
  // Población elegida a mano (solo forma; la lista la valida asegura).
  let eleccionPoblacion: string | null = null
  const ep = b?.eleccionPoblacion
  if (ep !== undefined && ep !== null) {
    if (accion !== 'reintentar' || typeof ep !== 'string' || !ep.trim() || ep.length > 120) {
      return NextResponse.json({ estado: 'error', mensaje: 'eleccionPoblacion: texto de la lista (máx. 120) y solo con reintentar' }, { status: 400 })
    }
    eleccionPoblacion = ep.trim()
  }
  const r = await resolverTrabajoBandeja(id, accion, eleccionVersion, eleccionPoblacion)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
