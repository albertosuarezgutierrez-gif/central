import { NextResponse } from 'next/server'
import { workerAutorizado } from '@/lib/tarificador-worker-auth'
import { recogerCodigo } from '@/lib/tarificador-codigo-sms'
import { clasificarErrorBdCodigo, uuidValido } from '@/lib/tarificador-codigo-sms-reglas'
import { codigoErrorParaLog } from '@/lib/tarificador-sesion-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ trabajo: string }> }
const NO_CACHE = { 'cache-control': 'private, no-store' }

/**
 * `GET /api/tarificador/codigo-sms/[trabajo]` — el worker sondea su petición. UN uso: el sello se anula al servirlo.
 *   200 `{ estado:'listo', sello, leaseHasta }` (el código SELLADO para la privada del worker: aquí no se puede abrir)
 *   200 `{ estado:'esperando' }` · 404 `sin_peticion` (o el trabajo ya acabó) · 410 `caducada` / `ya_recogido` · 503.
 * El sello no se loguea nunca.
 */
export async function GET(req: Request, ctx: Ctx) {
  if (!workerAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const trabajoId = uuidValido((await ctx.params).trabajo)
  if (!trabajoId) return NextResponse.json({ estado: 'error', motivo: 'trabajo_invalido' }, { status: 400 })
  try {
    const r = await recogerCodigo(trabajoId)
    if (r.estado === 'sin_peticion') return NextResponse.json(r, { status: 404, headers: NO_CACHE })
    if (r.estado === 'caducada' || r.estado === 'ya_recogido') return NextResponse.json(r, { status: 410, headers: NO_CACHE })
    return NextResponse.json(r, { headers: NO_CACHE })
  } catch (e) {
    const c = clasificarErrorBdCodigo(e)
    console.error('[tarificador] codigo-sms recoger', c.estado, codigoErrorParaLog(e))
    return NextResponse.json({ estado: c.estado, ...(c.mensaje ? { mensaje: c.mensaje } : {}) }, { status: c.status })
  }
}
