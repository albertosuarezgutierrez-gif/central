import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerTrazaTrabajo } from '@/lib/tarificador-bandeja'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/trabajo/[id]/traza` — pasos que dio el bot en ese trabajo (login, navegación,
 * formulario, tarificar, lectura de primas) con inicio, duración, ok y código de error, más la versión del bot.
 * Bearer de operador; filtrado por correduría; solo lectura. Sin datos personales ni valores de formulario por diseño.
 * 200 `{ botVersion|null, pasos[] }` (lista vacía = el trabajo no registró traza, no «no hizo nada»).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const t = await leerTrazaTrabajo(correduria.id, id)
    if (!t) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json(t, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/traza', e) }, { status: 503 })
  }
}
