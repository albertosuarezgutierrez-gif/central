import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { leerEstadisticasTarificador } from '@/lib/tarificador-estadisticas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/estadisticas` — estadísticas de los bots (15/10/2026) de los últimos 7 y 30 días por
 * compañía × ramo × versión del bot: trabajos, % con precio, % atascado/requiere_humano/error_definitivo, tiempo medio hasta
 * precio y top 5 claves de atasco. Bearer de operador; por correduría; solo lectura; SOLO agregados (nada del riesgo ni
 * datos personales). Un fallo de lectura es 503, nunca una lista vacía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    return NextResponse.json(await leerEstadisticasTarificador(correduria.id), { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/estadisticas', e) }, { status: 503 })
  }
}
