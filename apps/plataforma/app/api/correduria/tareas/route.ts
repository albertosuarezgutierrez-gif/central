import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { crearTareaVinculadaAsegura, tareasVinculadasAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/tareas — tareas de una PÓLIZA o de un CLIENTE (puerto de asegura, tabla de tareas de siempre).
 *   GET  ?polizaId=… | ?clienteId=…  → lista (las del cliente incluyen las de sus pólizas)
 *   POST { polizaId?, clienteId?, tipo, fechaLimite, observaciones, prioridad? } → crea una tarea suelta
 * Cerrar/posponer: `PATCH /api/correduria/oportunidad/tarea` con `suelta: true` (la vía de Mi mesa).
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const polizaId = req.nextUrl.searchParams.get('polizaId')?.trim()
  const clienteId = req.nextUrl.searchParams.get('clienteId')?.trim()
  if (!polizaId && !clienteId) return NextResponse.json({ estado: 'invalido', motivo: 'Falta polizaId o clienteId.' }, { status: 422 })
  const r = await tareasVinculadasAsegura(polizaId ? { polizaId } : { clienteId: clienteId as string })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined)
  if (!b || (!id(b.polizaId) && !id(b.clienteId))) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta polizaId o clienteId.' }, { status: 422 })
  }
  // Solo los campos que el puerto lee; el actor, de la sesión y el último.
  const r = await crearTareaVinculadaAsegura({
    polizaId: id(b.polizaId), clienteId: id(b.clienteId),
    tipo: b.tipo, prioridad: b.prioridad, observaciones: b.observaciones, fechaLimite: b.fechaLimite,
    actor: guarda.session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
