import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { lanzarPendientes } from '@/lib/tarificador'
import { solicitarEmision } from '@/lib/tarificador-emision'
import { rpaActivo } from '@/lib/tarificador-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `POST /api/operador/tarificador/emision` `{ presupuestoId, trabajoOrigenId }` — pide que el ROBOT prepare la emisión
 * de la opción que el cliente aceptó y firmó (10/10/2026). NO emite: la máquina para en la pantalla previa, lee la
 * prima y, si es EXACTAMENTE la aceptada, se pide el botón a Alberto por Telegram. Solo Allianz Comunidades.
 * Cerrojos: Bearer de operador · actor humano (plataforma solo deja pasar a quien solicita) · `TARIFICADOR_RPA_ACTIVO`
 * · `TARIFICADOR_EMISION_ACTIVA` · SQL aplicado · precondiciones del presupuesto (aceptado, firmado, IPID, vigente).
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!rpaActivo(process.env)) return NextResponse.json({ estado: 'apagado', mensaje: 'el tarificador RPA está apagado (TARIFICADOR_RPA_ACTIVO)' }, { status: 503 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof body?.presupuestoId === 'string' ? body.presupuestoId.trim() : ''
  const trabajoOrigenId = typeof body?.trabajoOrigenId === 'string' ? body.trabajoOrigenId.trim() : ''
  if (!UUID.test(presupuestoId) || !UUID.test(trabajoOrigenId)) {
    return NextResponse.json({ estado: 'error', mensaje: 'presupuestoId y trabajoOrigenId tienen que ser uuid' }, { status: 400 })
  }
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  // Pedir una emisión es de una PERSONA (plataforma comprueba cuál); un cron o un agente no la pide.
  if (actor.tipo !== 'humano') return NextResponse.json({ estado: 'rechazado', motivo: 'solo una persona puede pedir una emisión' }, { status: 403 })
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await solicitarEmision({ correduriaId: correduria.id, presupuestoId, trabajoOrigenId, solicitadoPor: `humano:${actor.id}` })
    if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: r.status })
    const lanzado = await lanzarPendientes(correduria.id, r.compania).catch(() => null)
    return NextResponse.json({ estado: 'encolado', trabajoId: r.trabajoId, lanzado: !!lanzado?.lanzados.includes(r.trabajoId) }, { status: 202 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/emision', e) }, { status: 503 })
  }
})
