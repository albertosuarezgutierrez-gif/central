import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { rpaActivo } from '@/lib/tarificador-reglas'
import { leerPresupuestosOportunidad, pedirPresupuestosOportunidad } from '@/lib/tarificador-oportunidad'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `GET /api/operador/tarificador/oportunidad?id=<uuid>` — «Presupuestos de compañías» de una oportunidad
 * (07/10/2026): el formulario guardado, el pre-relleno del cliente si no lo hay y los trabajos del bot
 * ligados a ella (los 30 más recientes). Solo lectura (no depende de `TARIFICADOR_RPA_ACTIVO`). Lista
 * blanca: los trabajos salen por `proyectarTrabajo` (sin URL del portal, HTML, captura ni credenciales).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await leerPresupuestosOportunidad(correduria.id, id)
    if (!r) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/oportunidad', e) }, { status: 503 })
  }
}

/**
 * `POST /api/operador/tarificador/oportunidad` `{ oportunidadId, ramo, formulario, extras: {compania: {...}}, companias: [] }`
 * — valida el formulario común con cada compañía (todo o nada), lo guarda en la oportunidad y encola UN
 * trabajo por compañía ligado a ella. TARIFICAR ≠ EMITIR. 202 `{ resultados: [{compania, estado, trabajoId|motivo}] }`.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) {
    return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', mensaje: 'oportunidadId tiene que ser uuid' }, { status: 400 })
  const ramo = typeof b.ramo === 'string' ? b.ramo.trim() : ''
  if (!ramo) return NextResponse.json({ estado: 'error', mensaje: 'falta ramo' }, { status: 400 })
  if (!Array.isArray(b.companias) || !b.companias.every((c) => typeof c === 'string')) {
    return NextResponse.json({ estado: 'error', mensaje: 'companias tiene que ser una lista de textos' }, { status: 400 })
  }
  const extras = b.extras && typeof b.extras === 'object' && !Array.isArray(b.extras) ? (b.extras as Record<string, unknown>) : {}

  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const solicitadoPor = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`

  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await pedirPresupuestosOportunidad({
      correduriaId: correduria.id, oportunidadId, ramo, formulario: b.formulario, extras,
      companias: b.companias as string[], solicitadoPor, actor: solicitadoPor,
    })
    if (!r.ok) return NextResponse.json({ estado: 'error', mensaje: r.motivo, errores: r.errores ?? [] }, { status: r.status })
    return NextResponse.json({ estado: 'encolado', resultados: r.resultados }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/oportunidad', e) }, { status: 503 })
  }
})
