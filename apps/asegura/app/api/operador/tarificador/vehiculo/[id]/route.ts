import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { hayVehiculoMatricula } from '@/lib/esquema-bd'
import { leerConsultaVehiculo } from '@/lib/tarificador-vehiculo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/vehiculo/[id]` — estado de una consulta de vehículo por matrícula y, si terminó, su resultado
 * (`{ estado: 'ok', vehiculo }` o `{ estado: 'sin_resultado' }`). Un fallo da solo su `tipoError` (sin mensajes ni matrícula).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!RE_UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    if (!(await hayVehiculoMatricula())) return NextResponse.json({ estado: 'error', mensaje: 'vehiculo_sin_esquema' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await leerConsultaVehiculo(correduria.id, id)
    if (!r) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/vehiculo/[id]', e) }, { status: 503 })
  }
}
