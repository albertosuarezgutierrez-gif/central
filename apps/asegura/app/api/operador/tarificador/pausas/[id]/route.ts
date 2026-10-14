import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { lanzarPendientes } from '@/lib/tarificador'
import { rpaActivo } from '@/lib/tarificador-reglas'
import { reanudarPausa } from '@/lib/tarificador-robustez'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/pausas/[id]` `{ accion: 'reanudar' }` — F2: Alberto reanuda una pareja (compañía, ramo)
 * cortada tras 3 fallos seguidos del bot. Vuelve a encolar/reclamar y se lanza lo pendiente si hay hueco. Idempotente.
 */
export const POST = auditado(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (b?.accion !== 'reanudar') return NextResponse.json({ estado: 'error', mensaje: "accion tiene que ser 'reanudar'" }, { status: 400 })
  const a = leerActor(req.headers.get(CABECERA_ACTOR))
  const actor = a.tipo === 'desconocido' ? 'operador' : `${a.tipo}:${a.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const r = await reanudarPausa(correduria.id, id, actor)
    if (r.estado === 'sin_esquema') return NextResponse.json(r, { status: 503 })
    if (r.estado === 'no_encontrado') return NextResponse.json(r, { status: 404 })
    let lanzados = 0
    if (r.estado === 'reanudada' && rpaActivo(process.env)) {
      const l = await lanzarPendientes(correduria.id, r.compania).catch(() => null)
      lanzados = l?.lanzados.length ?? 0
    }
    return NextResponse.json({ estado: r.estado, compania: r.compania, ramo: r.ramo, lanzados })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/pausas', e) }, { status: 503 })
  }
})
