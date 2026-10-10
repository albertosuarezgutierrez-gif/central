import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { trabajoParaWorker } from '@/lib/tarificador'
import { emisionParaWorker } from '@/lib/tarificador-emision'
import { rpaActivo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/tarificador/trabajo/[id]` — el worker (máquina de Fly) pide el riesgo de SU trabajo.
 * Bearer `TARIFICADOR_WORKER_SECRET`. Solo responde si el trabajo está `en_curso` con lease vivo, y
 * solo con compañía + ramo + riesgo: ni cliente, ni póliza, ni nada de la cartera.
 * Con el canal apagado, 503: el worker sale sin entrar en el portal.
 * EMISIÓN (10/10/2026): un trabajo `modo = 'emision'` añade `emision: { fase: 'preparar' }` o, tras la autorización de
 * Alberto, `{ fase: 'ejecutar', token, primaCents }` — el token se entrega UNA sola vez (en BD solo su SHA-256). Si no
 * se puede entregar (interruptor apagado, ya entregado, caducado), 404: el worker sale sin entrar en el portal.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado' }, { status: 503 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const t = await trabajoParaWorker(id)
    if (!t) return NextResponse.json({ estado: 'no_disponible' }, { status: 404 })
    if (t.modo === 'emision') {
      const emision = await emisionParaWorker(t.id)
      if (!emision) return NextResponse.json({ estado: 'no_disponible' }, { status: 404 })
      return NextResponse.json({ estado: 'ok', trabajo: { ...t, emision } }, { headers: { 'Cache-Control': 'no-store' } })
    }
    return NextResponse.json({ estado: 'ok', trabajo: t })
  } catch (e) {
    console.error('[tarificador] trabajo', id, e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 503 })
  }
}
