import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { prepararPresupuestoRpaOportunidad } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 90

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/oportunidad/[id]/presupuesto-rpa — prepara el presupuesto en BORRADOR con las
 * ofertas del bot de la oportunidad (idempotente). Con la sesión de la correduría; el secreto de operador no sale
 * de plataforma. NO ENVÍA NADA AL CLIENTE (`avisar:false` fijo en el puente).
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const r = await prepararPresupuestoRpaOportunidad(id)
  // 401/403 de asegura es el secreto de operador, no la sesión del usuario: no se reenvía tal cual.
  const status = r.status === 401 || r.status === 403 ? 502 : r.status
  return NextResponse.json(r.json ?? { estado: 'error' }, { status })
}
