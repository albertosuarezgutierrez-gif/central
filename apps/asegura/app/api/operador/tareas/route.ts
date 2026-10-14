import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { crearTareaVinculada, tareasVinculadas } from '@/lib/tarea-suelta'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * Tareas de una PÓLIZA o de un CLIENTE (tabla `gestiones`, la misma de siempre; ver `lib/tarea-suelta.ts`).
 *   GET  ?polizaId=…  → las de esa póliza
 *   GET  ?clienteId=… → las del cliente + las de todas sus pólizas
 *   POST { polizaId?, clienteId?, tipo, fechaLimite, observaciones, prioridad?, actor } → crea una tarea suelta
 * Cerrar/posponer: `PATCH /api/operador/oportunidad/tarea` con `suelta: true` (la vía de Mi mesa).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const q = new URL(req.url).searchParams
    const polizaId = q.get('polizaId')
    const clienteId = q.get('clienteId')
    if (!polizaId && !clienteId) return NextResponse.json({ estado: 'invalido', motivo: 'falta polizaId o clienteId' }, { status: 422 })
    const r = await tareasVinculadas(correduria.id, polizaId ? { polizaId } : { clienteId: clienteId as string })
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', tareas: r.tareas, truncado: r.truncado })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tareas', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) return NextResponse.json({ estado: 'invalido', motivo: 'cuerpo JSON no válido' }, { status: 422 })
    const actor = typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await crearTareaVinculada(
      correduria.id,
      { polizaId: b.polizaId, clienteId: b.clienteId },
      { tipo: b.tipo, prioridad: b.prioridad, observaciones: b.observaciones, fechaLimite: b.fechaLimite },
      actor,
    )
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', tareaId: r.tareaId })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tareas', e) }, { status: 500 })
  }
})
