import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { entregarCodigo, marcarAvisadosCodigo, pendientesAvisoCodigo } from '@/lib/tarificador-codigo-sms'
import { clasificarErrorBdCodigo, leerOrdenOperador } from '@/lib/tarificador-codigo-sms-reglas'
import { codigoErrorParaLog } from '@/lib/tarificador-sesion-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_CACHE = { 'cache-control': 'private, no-store' }
const SIN_CORREDURIA = () => NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })

function errorBd(op: string, e: unknown): NextResponse {
  const c = clasificarErrorBdCodigo(e)
  // Solo el código de error: nunca el mensaje de Postgres (podría llevar la fila) ni nada del cuerpo.
  console.error('[tarificador] operador codigo-sms', op, c.estado, codigoErrorParaLog(e))
  return NextResponse.json({ estado: c.estado, ...(c.mensaje ? { mensaje: c.mensaje } : {}) }, { status: c.status })
}

/**
 * `GET /api/operador/tarificador/codigo-sms` — peticiones de código SMS vivas de las que aún no se ha avisado (cron de
 * plataforma, cada minuto). Solo `{ id, ref, compania, ramo, caducaEn }`: nada del riesgo ni del cliente. Un fallo de
 * lectura es `{estado:'error'}` (503), nunca una lista vacía.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    return NextResponse.json({ estado: 'ok', pendientes: await pendientesAvisoCodigo(correduria.id) }, { headers: NO_CACHE })
  } catch (e) {
    return errorBd('pendientes', e)
  }
}

/**
 * `POST` — dos órdenes:
 *   `{ accion:'avisados', ids:[uuid] }` → marca las peticiones avisadas (SOLO si el Telegram salió; idempotente).
 *   `{ accion:'entregar', ref?, codigo }` → la respuesta de Alberto (el webhook de plataforma ya comprobó `from.id` =
 *     TELEGRAM_CHAT_ID). Solo 4-8 dígitos; se SELLA para el worker y se guarda solo el sello (un uso, TTL 10 min). Sin `ref`
 *     solo vale si hay UNA petición abierta. Respuestas: `entregado` · `sin_peticion` · `varias` · `caducada` ·
 *     `ya_respondida` · `trabajo_cerrado` (200 todas: es el desenlace, no un fallo) · 400 forma.
 * `auditado()` solo guarda ids con forma de uuid de claves `*Id`: el código (dígitos) no entra en la auditoría. Nunca se loguea.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const o = leerOrdenOperador(await req.json().catch(() => null))
  if (!o.ok) return NextResponse.json({ estado: 'error', motivo: o.motivo }, { status: o.status })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    if (o.valor.accion === 'avisados') return NextResponse.json({ estado: 'ok', marcados: await marcarAvisadosCodigo(correduria.id, o.valor.ids) }, { headers: NO_CACHE })
    const r = await entregarCodigo(correduria.id, o.valor.ref, o.valor.codigo)
    return NextResponse.json(r, { headers: NO_CACHE })
  } catch (e) {
    return errorBd(o.valor.accion, e)
  }
})
