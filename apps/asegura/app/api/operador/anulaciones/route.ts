import { NextResponse } from 'next/server'
import { ACCIONES_ANULACION, type AccionAnulacion } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { accionAnulacion, anulacionesAbiertas, anulacionesDePoliza, crearAnulacion } from '@/lib/anulaciones'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Expedientes de anulación (pieza 2-d).
 *
 *   GET   ?polizaId= → { estado:'ok', anulaciones } de esa póliza; sin él, los ABIERTOS de la correduría
 *   POST  { polizaId, tipo, solicitadaPor, motivo, motivoTexto?, fechaEfecto, actor }
 *         → 201 { estado:'creada', id, advertencia } · 404 · 409 ya_abierta · 422 invalida
 *   PATCH { id, accion:'marcar_firmada'|'marcar_comunicada'|'confirmar'|'desistir', nota?, actor }
 *         → { estado:'hecho', nuevo } · 404 · 409 no_permitida · 422 invalida
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const polizaId = new URL(req.url).searchParams.get('polizaId')
    const anulaciones = polizaId ? await anulacionesDePoliza(correduria.id, polizaId) : await anulacionesAbiertas(correduria.id)
    return NextResponse.json({ estado: 'ok', anulaciones })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/anulaciones', e) }, { status: 500 })
  }
}

function actorDe(c: Record<string, unknown> | null): string {
  return typeof c?.actor === 'string' && c.actor.trim() ? c.actor.trim() : 'corredor'
}

const STATUS_CREAR: Record<string, number> = { creada: 201, no_encontrada: 404, ya_abierta: 409, invalida: 422 }
const STATUS_ACCION: Record<string, number> = { hecho: 200, no_encontrada: 404, no_permitida: 409, invalida: 422 }

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof cuerpo?.polizaId === 'string' ? cuerpo.polizaId : ''
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await crearAnulacion(correduria.id, polizaId, cuerpo, actorDe(cuerpo))
    return NextResponse.json(r, { status: STATUS_CREAR[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/anulaciones', e) }, { status: 500 })
  }
})

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : ''
  const accion = ACCIONES_ANULACION.find((a) => a === cuerpo?.accion) as AccionAnulacion | undefined
  if (!accion) return NextResponse.json({ estado: 'invalida', motivo: 'acción no válida' }, { status: 422 })
  const nota = typeof cuerpo?.nota === 'string' ? cuerpo.nota : null
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await accionAnulacion(correduria.id, id, accion, nota, actorDe(cuerpo))
    return NextResponse.json(r, { status: STATUS_ACCION[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/anulaciones', e) }, { status: 500 })
  }
})
