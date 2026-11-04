import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { hayVehiculoMatricula } from '@/lib/esquema-bd'
import { leerResultadoVehiculoWorker } from '@/lib/tarificador-vehiculo-reglas'
import { registrarResultadoVehiculo } from '@/lib/tarificador-vehiculo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/vehiculo/resultado` `{ trabajoId, resultado: 'vehiculo', estado: 'ok' | 'sin_resultado', vehiculo?, botVersion? }` —
 * el worker cierra una consulta de vehículo por matrícula: caché 24 h + trabajo `ok` con el riesgo purgado. Un FALLO va por
 * `/api/tarificador/resultado` (`resultado: 'error'`, como cualquier trabajo). Correduría y matrícula salen de la fila, nunca del cuerpo.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const l = leerResultadoVehiculoWorker(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', errores: l.errores }, { status: 400 })
  try {
    if (!(await hayVehiculoMatricula())) return NextResponse.json({ estado: 'error', motivo: 'vehiculo_sin_esquema' }, { status: 503 })
    const r = await registrarResultadoVehiculo(l.trabajoId, l.r, l.botVersion)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'conflicto') return NextResponse.json(r, { status: 409 })
    if (r.estado === 'rechazado') return NextResponse.json(r, { status: 400 })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[tarificador] vehiculo/resultado', l.trabajoId, e instanceof Error ? e.message.slice(0, 200) : 'error')
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
