import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { aprobacionesPendientes, decidir, type CuerpoDecision } from '@/lib/aprobaciones-asegura'

export const dynamic = 'force-dynamic'

/** GET — lo que espera tu OK (puerto de asegura). `sin_datos` ≠ «no hay nada». */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await aprobacionesPendientes())
}

/** PATCH { id, decision:'aprobar', asunto, texto, contactoId? } | { id, decision:'rechazar' } | { id, decision:'cerrar_incierto', salio } — el actor sale de la SESIÓN. */
export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  const cuerpo: CuerpoDecision | null =
    b?.decision === 'aprobar' ? { id, decision: 'aprobar', asunto: typeof b.asunto === 'string' ? b.asunto : '', texto: typeof b.texto === 'string' ? b.texto : '', ...(typeof b.contactoId === 'string' ? { contactoId: b.contactoId } : {}) }
    : b?.decision === 'rechazar' ? { id, decision: 'rechazar' }
    : b?.decision === 'cerrar_incierto' && typeof b.salio === 'boolean' ? { id, decision: 'cerrar_incierto', salio: b.salio }
    : null
  if (!id || !cuerpo) return NextResponse.json({ desenlace: 'invalida', motivo: null }, { status: 422 })
  const r = await decidir(cuerpo, guarda.session.email)
  return NextResponse.json({ desenlace: r.desenlace, motivo: r.motivo }, { status: r.status })
}
