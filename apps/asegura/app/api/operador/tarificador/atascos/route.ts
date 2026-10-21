import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { listarAtascos, listarPausas, marcarAtascosAvisados, marcarPausasAvisadas } from '@/lib/tarificador-robustez'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/atascos[?avisos=1]` — F2 del plan de robustez (14/10/2026): bots ATASCADOS (esperan que
 * Alberto elija un elemento numerado) y PAUSAS por compañía/ramo (3 fallos seguidos). Sin selectores ni datos personales:
 * compañía, ramo, qué se buscaba y los candidatos redactados. `avisos=1` (cron de plataforma): solo lo que falta por avisar,
 * con la captura del atasco (va al chat de Alberto). Sin el SQL de la F2: `{ estado: 'sin_esquema' }` (NO «no hay nada»).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const avisos = new URL(req.url).searchParams.get('avisos') === '1'
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const [a, p] = await Promise.all([
      listarAtascos(correduria.id, { pendientesAviso: avisos, conCaptura: avisos, sinCapturaConDatos: true }),
      listarPausas(correduria.id, { pendientesAviso: avisos }),
    ])
    if (a.estado === 'sin_esquema' && p.estado === 'sin_esquema') return NextResponse.json({ estado: 'sin_esquema' })
    return NextResponse.json({
      estado: 'ok',
      atascos: a.estado === 'ok' ? a.atascos : [],
      pausas: p.estado === 'ok' ? p.pausas : [],
      ilegibles: a.estado === 'ok' ? a.ilegibles : 0,
      sinEsquema: { atascos: a.estado === 'sin_esquema', pausas: p.estado === 'sin_esquema' },
    }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/atascos', e) }, { status: 503 })
  }
}

/** `POST … { atascos?: uuid[], pausas?: uuid[] }` — marca como avisados SOLO los que salieron por Telegram (idempotente). */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && UUID.test(x)).slice(0, 50) : [])
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const atascos = await marcarAtascosAvisados(correduria.id, ids(body?.atascos))
    const pausas = await marcarPausasAvisadas(correduria.id, ids(body?.pausas))
    return NextResponse.json({ estado: 'ok', marcados: { atascos, pausas } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/atascos', e) }, { status: 503 })
  }
})
