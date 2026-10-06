import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerTrabajoOperador } from '@/lib/tarificador-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/trabajo/[id]` — estado y ofertas de un trabajo del tarificador RPA,
 * para que plataforma lo pinte. Bearer de operador; filtrado por correduría. Solo lectura: NO depende
 * de `TARIFICADOR_RPA_ACTIVO` (solo encolar se bloquea). Lista blanca: sin URL del portal, sin
 * HTML/captura del fallo, sin riesgo ni credenciales.
 * 200 `{ estado, creadoEn, actualizadoEn, error: {tipo,mensaje}|null, ofertas[], pdfs[] }`.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const t = await leerTrabajoOperador(correduria.id, id)
    if (!t) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json(t, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/trabajo', e) }, { status: 503 })
  }
}
