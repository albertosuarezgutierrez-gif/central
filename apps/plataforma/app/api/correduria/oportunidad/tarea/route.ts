import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cerrarTareaAsegura, crearTareaAsegura, type Reenvio } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/oportunidad/tarea — tareas de seguimiento (puerto de asegura).
 *   POST  { oportunidadId, tipo, fechaLimite, observaciones, prioridad? } → crea
 *   PATCH { tareaId, resultado? }                                        → cierra
 */
export async function POST(req: NextRequest) {
  return reenviar(req, 'oportunidadId', crearTareaAsegura)
}

export async function PATCH(req: NextRequest) {
  return reenviar(req, 'tareaId', cerrarTareaAsegura)
}

async function reenviar(req: NextRequest, obligatorio: 'oportunidadId' | 'tareaId', llamada: (b: Record<string, unknown>) => Promise<Reenvio>) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body[obligatorio] !== 'string' || (body[obligatorio] as string).trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: `Falta ${obligatorio}.` }, { status: 422 })
  }
  const r = await llamada({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
