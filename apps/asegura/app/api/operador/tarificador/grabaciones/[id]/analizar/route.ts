import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { analizarGrabacion, type ModoAnalisis } from '@/lib/tarificador-grabaciones'
import { SIN_CORREDURIA, UUID, errorGrabaciones } from '@/lib/tarificador-grabaciones-http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Un lote son hasta 3 llamadas a la IA de hasta 60 s.
export const maxDuration = 300

type Ctx = { params: Promise<{ id: string }> }
const MODOS: readonly ModoAnalisis[] = ['pendientes', 'reintentar', 'todas']

/**
 * `POST /api/operador/tarificador/grabaciones/[id]/analizar` `{ modo?: 'pendientes'|'reintentar'|'todas' }` —
 * la IA saca el MAPA de un lote de pantallas (campos, botones seguro/PROHIBIDO, primas). Devuelve cuántas
 * quedan: la UI repite mientras `pendientes > 0` y no haya `tope`. Tope de llamadas por grabación
 * (`TARIFICADOR_GRABADOR_MAX_LLAMADAS`, 60 por defecto). Nada de esto toca un portal.
 */
export const POST = auditado(async (req: Request, ctx: Ctx) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => ({}))) as { modo?: unknown } | null
  const modo = (b?.modo ?? 'pendientes') as ModoAnalisis
  if (!MODOS.includes(modo)) return NextResponse.json({ estado: 'error', mensaje: `modo tiene que ser ${MODOS.join('|')}` }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return SIN_CORREDURIA()
    const r = await analizarGrabacion(correduria.id, id, modo)
    if (r.estado === 'no_encontrada') return NextResponse.json(r, { status: 404 })
    if (r.estado === 'sin_pantallas') return NextResponse.json({ ...r, mensaje: 'la grabación no tiene pantallas' }, { status: 409 })
    return NextResponse.json(r)
  } catch (e) {
    return errorGrabaciones('operador/tarificador/grabaciones/[id]/analizar', e)
  }
})
