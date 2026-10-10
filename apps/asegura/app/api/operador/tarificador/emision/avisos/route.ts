import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { avisosEmisionPendientes, marcarAvisosEmision } from '@/lib/tarificador-emision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/emision/avisos` — los Telegram de emisión que faltan por mandar (los manda el cron de
 * plataforma): petición de botón (con la captura de la pantalla previa), emitida, o parada. Solo iniciales del tomador.
 * Sin el SQL aplicado: `{ estado: 'sin_esquema' }` (NO «no hay pendientes»).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const pendientes = await avisosEmisionPendientes(correduria.id)
    if (pendientes === null) return NextResponse.json({ estado: 'sin_esquema' })
    return NextResponse.json({ estado: 'ok', pendientes }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/emision/avisos', e) }, { status: 503 })
  }
}

/** `POST … { trabajoIds: uuid[] }` — marca como avisados SOLO los que salieron (idempotente). */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const ids = Array.isArray(body?.trabajoIds) ? body.trabajoIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 50) : []
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const marcados = await marcarAvisosEmision(correduria.id, ids)
    return NextResponse.json({ estado: 'ok', marcados })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/emision/avisos', e) }, { status: 503 })
  }
})
