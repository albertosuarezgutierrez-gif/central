import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerIntegracionesActivas } from '@/lib/tarificador-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/integraciones` — compañía+ramo que el tarificador RPA puede tarificar ahora
 * (`companias_integracion` activa y `rpa_autorizada`). Bearer de operador; solo lectura.
 * 200 `{ integraciones: [{ compania, ramo }] }` (lista vacía = revisado y no hay ninguna).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    return NextResponse.json({ integraciones: await leerIntegracionesActivas(correduria.id) }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/integraciones', e) }, { status: 503 })
  }
}
