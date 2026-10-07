import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { marcarAvisadosVerificacion, pendientesVerificacion } from '@/lib/tarificador-verificacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/tarificador/avisos-verificacion` — los trabajos del bot que acabaron en `requiere_humano` por
 * una VERIFICACIÓN (SMS/OTP) y de los que aún no se ha avisado a Alberto. Solo id, compañía y ramo: nada del
 * riesgo ni del cliente. Un fallo de lectura es `{estado:'error'}`, nunca una lista vacía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    return NextResponse.json({ estado: 'ok', pendientes: await pendientesVerificacion(correduria.id) }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/avisos-verificacion', e) }, { status: 503 })
  }
}

/**
 * `POST { ids: [uuid] }` — marca como avisados (una sola vez por trabajo; idempotente). Plataforma lo llama
 * SOLO si el Telegram salió: si no salió, no se marca y la pasada siguiente reintenta.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { ids?: unknown } | null
  if (!b || !Array.isArray(b.ids) || !b.ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ estado: 'error', mensaje: 'ids tiene que ser una lista de uuid' }, { status: 400 })
  }
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    return NextResponse.json({ estado: 'ok', marcados: await marcarAvisadosVerificacion(correduria.id, b.ids as string[]) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/avisos-verificacion', e) }, { status: 503 })
  }
})
