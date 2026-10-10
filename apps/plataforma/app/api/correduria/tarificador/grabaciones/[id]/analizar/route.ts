import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { analizarGrabacionAsegura } from '@/lib/tarificador-grabaciones-asegura'

export const dynamic = 'force-dynamic'
// asegura procesa un lote de hasta 3 pantallas con la IA (hasta ~3 min).
export const maxDuration = 300

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MODOS = ['pendientes', 'reintentar', 'todas']
type Ctx = { params: Promise<{ id: string }> }

/**
 * POST { modo?: 'pendientes'|'reintentar'|'todas' } — un LOTE del análisis con IA (mapa de campos, botones
 * seguro/PROHIBIDO y primas). La pantalla repite mientras queden pendientes y no haya tope. Cuesta IA (con
 * tope de llamadas por grabación en asegura); no toca ningún portal.
 */
export async function POST(req: Request, ctx: Ctx) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no válido' }, { status: 400 })
  const b = (await req.json().catch(() => ({}))) as { modo?: unknown } | null
  const modo = typeof b?.modo === 'string' ? b.modo : 'pendientes'
  if (!MODOS.includes(modo)) return NextResponse.json({ estado: 'error', mensaje: 'modo no válido' }, { status: 400 })
  const r = await analizarGrabacionAsegura(id, modo)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
