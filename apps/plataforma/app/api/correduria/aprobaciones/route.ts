import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { aprobacionesPendientes, decidir } from '@/lib/aprobaciones-asegura'

export const dynamic = 'force-dynamic'

/** GET — lo que espera tu OK (puerto de asegura). `sin_datos` ≠ «no hay nada». */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await aprobacionesPendientes())
}

/** PATCH { id, decision:'aprobar', asunto, texto } | { id, decision:'rechazar' } — el actor sale de la SESIÓN. */
export async function PATCH(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof b?.id === 'string' ? b.id : ''
  const decision = b?.decision === 'aprobar' || b?.decision === 'rechazar' ? b.decision : null
  if (!id || !decision) return NextResponse.json({ desenlace: 'invalida', motivo: null }, { status: 422 })
  const r = await decidir({
    id, decision,
    ...(decision === 'aprobar' ? { asunto: typeof b?.asunto === 'string' ? b.asunto : '', texto: typeof b?.texto === 'string' ? b.texto : '' } : {}),
  }, guarda.session.email)
  return NextResponse.json({ desenlace: r.desenlace, motivo: r.motivo }, { status: r.status })
}
