// apps/plataforma/app/api/contable/feedback/route.ts
// Registro del 👎 del chat contable: Alberto marca una respuesta como mala. Se guarda en
// `contable_feedback` (pregunta + respuesta + nota opcional) para alimentar el bucle de mejora
// (/agentes-entrenador o una sesión lo convierte en cobertura nueva + test). No llama a la IA.
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { guardarFeedback } from '@/lib/contable/memoria'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const pregunta = typeof body?.pregunta === 'string' ? body.pregunta.trim() : ''
  const respuesta = typeof body?.respuesta === 'string' ? body.respuesta.trim() : ''
  const nota = typeof body?.nota === 'string' ? body.nota.trim() : ''
  if (!pregunta && !respuesta) return NextResponse.json({ error: 'nada que registrar' }, { status: 400 })

  await guardarFeedback(session.id, pregunta, respuesta, nota || undefined)
  return NextResponse.json({ ok: true })
}
