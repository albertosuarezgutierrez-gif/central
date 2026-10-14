import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { lanzarPendientes } from '@/lib/tarificador'
import { rpaActivo } from '@/lib/tarificador-reglas'
import { listarAtascos, responderAtasco, type RespuestaAtasco } from '@/lib/tarificador-robustez'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `GET /api/operador/tarificador/atascos/[id]` — un atasco ESPERANDO con su captura (pantalla «Bots atascados»). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const r = await listarAtascos(correduria.id, { id, conCaptura: true })
    if (r.estado === 'sin_esquema') return NextResponse.json(r, { status: 503 })
    const a = r.atascos[0]
    if (!a) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', atasco: a }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/atascos', e) }, { status: 503 })
  }
}

/**
 * `POST /api/operador/tarificador/atascos/[id]` `{ accion: 'elegir', n }` | `{ accion: 'descartar' }` — la respuesta de
 * Alberto a un bot atascado (pantalla o botón de Telegram). Elegir APRENDE el elemento N (origen humano) y el MISMO trabajo
 * vuelve a la cola (se lanza si hay hueco y la pareja no está en pausa); descartar cancela el trabajo. 409 si ya no espera
 * (idempotente: lo mismo dos veces = 200 `sin_cambios`). TARIFICAR ≠ EMITIR: el worker revalida con sus tablas cerradas.
 */
export const POST = auditado(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  let r: RespuestaAtasco
  if (b?.accion === 'descartar') r = { accion: 'descartar' }
  else if (b?.accion === 'elegir' && typeof b.n === 'number' && Number.isInteger(b.n) && b.n >= 1 && b.n <= 20) r = { accion: 'elegir', n: b.n }
  else return NextResponse.json({ estado: 'error', mensaje: "{ accion: 'elegir', n: 1..20 } o { accion: 'descartar' }" }, { status: 400 })
  const a = leerActor(req.headers.get(CABECERA_ACTOR))
  const actor = a.tipo === 'desconocido' ? 'operador' : `${a.tipo}:${a.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin correduría' }, { status: 503 })
    const res = await responderAtasco(correduria.id, id, r, actor)
    if (res.estado === 'sin_esquema') return NextResponse.json(res, { status: 503 })
    if (res.estado === 'no_encontrado') return NextResponse.json(res, { status: 404 })
    if (res.estado === 'conflicto') return NextResponse.json(res, { status: 409 })
    let lanzado = false
    if (res.estado === 'respondido' && !res.pausada && rpaActivo(process.env)) {
      // Mejor esfuerzo, como Reintentar de la bandeja: si Fly falla, el trabajo queda `pendiente` y el barrido lo lanza.
      const l = await lanzarPendientes(correduria.id, res.compania).catch(() => null)
      lanzado = !!l?.lanzados.includes(res.trabajoId)
    }
    return NextResponse.json({ estado: res.estado, trabajoId: res.trabajoId, compania: res.compania, ramo: res.ramo, pausada: res.pausada, lanzado })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/atascos', e) }, { status: 503 })
  }
})
