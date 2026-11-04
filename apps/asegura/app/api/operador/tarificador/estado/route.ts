import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerEstadoTarificador } from '@/lib/tarificador-estado'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/estado` — estado del TARIFICADOR (04/11/2026) por compañía × ramo: último precio (fecha,
 * canal rpa/codeoscopic, prima mínima), trabajos del bot ok/error en 7 y 30 días, último error REDACTADO (tipo, clave de
 * atasco y origen+ruta sin query) y estado del bot (activo / pilotaje / exploración / sin bot), más el gasto Avant2 del mes.
 * Bearer de operador; por correduría; solo lectura; SOLO agregados. Un fallo de lectura es 503, nunca una lista vacía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    return NextResponse.json(await leerEstadoTarificador(correduria.id), { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/estado', e) }, { status: 503 })
  }
}
