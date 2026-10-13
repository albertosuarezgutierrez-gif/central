import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { hayExplorador } from '@/lib/esquema-bd'
import { listarExploraciones } from '@/lib/tarificador-exploraciones'
import { MENSAJE_SIN_ESQUEMA } from '@/lib/tarificador-exploraciones-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/exploraciones` — las exploraciones del EXPLORADOR IA (compañía, producto, estado del
 * trabajo y del mapa, nº de pasos, coste estimado, motivo de parada). Solo lectura; sin mapa ni inventario. Bearer de
 * operador, filtrado por correduría. Sin el SQL aplicado → 503 `explorador_sin_esquema`.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    if (!(await hayExplorador())) return NextResponse.json({ estado: 'explorador_sin_esquema', mensaje: MENSAJE_SIN_ESQUEMA }, { status: 503 })
    return NextResponse.json({ estado: 'ok', exploraciones: await listarExploraciones(correduria.id) }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/exploraciones', e) }, { status: 503 })
  }
}
