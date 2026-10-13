import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cerrarTareaAsegura, crearTareaAsegura, cuerpoTareaSuelta, tareaSueltaAsegura, type Reenvio } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/oportunidad/tarea — tareas de seguimiento (puerto de asegura).
 *   POST  { oportunidadId, tipo, fechaLimite, observaciones, prioridad? } → crea
 *   PATCH { tareaId, resultado? }                                        → cierra (tarea de una oportunidad)
 *   PATCH { tareaId, suelta: true, accion: 'hecho', resultado? }         → cierra una tarea SUELTA de Mi mesa
 *   PATCH { tareaId, suelta: true, accion: 'posponer', dias }            → la pospone (hoy + dias, 1-365)
 * Las sueltas: 409 si cuelga de una oportunidad o es un hito del recibo devuelto (art. 15 LCS).
 */
export async function POST(req: NextRequest) {
  return reenviar(req, 'oportunidadId', crearTareaAsegura)
}

export async function PATCH(req: NextRequest) {
  const copia = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null
  if (copia?.suelta === true) return reenviarSuelta(copia)
  return reenviar(req, 'tareaId', cerrarTareaAsegura)
}

async function reenviarSuelta(body: Record<string, unknown>) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = cuerpoTareaSuelta(body, guarda.session.email)
  if (!cuerpo) return NextResponse.json({ estado: 'invalido', motivo: "Falta tareaId, o accion no es 'hecho'/'posponer' (con dias)." }, { status: 422 })
  const r = await tareaSueltaAsegura(cuerpo)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
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
