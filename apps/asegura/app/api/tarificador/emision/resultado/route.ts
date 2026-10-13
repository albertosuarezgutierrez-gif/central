import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { registrarResultadoEmision } from '@/lib/tarificador-emision'
import { leerResultadoEmision } from '@/lib/tarificador-emision-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/tarificador/emision/resultado` — lo que devuelve el worker en un trabajo de EMISIÓN. Bearer del worker.
 *   `{ trabajoId, resultado: 'pre_emision', primaCents, capturaBase64? }` — paró en la pantalla previa SIN pulsar.
 *   `{ trabajoId, resultado: 'emitida', numeroPoliza, capturaBase64? }` — pulsó el botón autorizado y leyó el nº.
 *   `{ trabajoId, resultado: 'incierto' | 'no_emitida', motivo, capturaBase64? }`.
 * Un trabajo que ya no está `en_curso` → 409 sin pisar nada. Sin `auditado()`: no es el puerto de operador; el rastro
 * es la fila del trabajo y la de `tarificacion_emision_autorizacion`.
 */
export async function POST(req: Request) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const l = leerResultadoEmision(await req.json().catch(() => null))
  if (!l.ok) return NextResponse.json({ estado: 'error', mensaje: l.error }, { status: 400 })
  try {
    const r = await registrarResultadoEmision(l.r)
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'conflicto') return NextResponse.json(r, { status: 409 })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[tarificador] resultado de emisión', l.r.trabajoId, e instanceof Error ? e.message.slice(0, 300) : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
