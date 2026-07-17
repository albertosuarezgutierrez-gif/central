import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { responderEmpresas } from '@/lib/empresas-agente'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { pregunta?: unknown; provincia?: unknown }
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.slice(0, 500) : ''
  if (!pregunta.trim()) return NextResponse.json({ error: 'Pregunta vacía' }, { status: 400 })
  const provincia = typeof body.provincia === 'string' && body.provincia ? body.provincia : undefined
  try {
    const r = await responderEmpresas(pregunta, provincia)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[empresas agente]', e)
    return NextResponse.json({ text: 'La IA no está disponible ahora mismo. Inténtalo en un momento.' }, { status: 200 })
  }
}
