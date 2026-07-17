import { NextRequest, NextResponse } from 'next/server'
import { accesoEmpresas } from '@/lib/empresas-acceso'
import { responderEmpresas } from '@/lib/empresas-agente'
import { buscarContextoAgente } from '@/lib/empresas-websearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

export async function POST(req: NextRequest) {
  if (!(await accesoEmpresas())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { pregunta?: unknown; provincia?: unknown; web?: unknown }
  const pregunta = typeof body.pregunta === 'string' ? body.pregunta.slice(0, 500) : ''
  if (!pregunta.trim()) return NextResponse.json({ error: 'Pregunta vacía' }, { status: 400 })
  const provincia = typeof body.provincia === 'string' && body.provincia ? body.provincia : undefined
  try {
    // Si el usuario activó 🌐, buscamos en web primero (best-effort) y pasamos el contexto al agente.
    let contextoWeb: string | undefined
    if (body.web === true) {
      const w = await buscarContextoAgente(pregunta).catch(() => null)
      if (w?.ok && w.text) contextoWeb = w.text
    }
    const r = await responderEmpresas(pregunta, provincia, contextoWeb)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[empresas agente]', e)
    return NextResponse.json({ text: 'La IA no está disponible ahora mismo. Inténtalo en un momento.' }, { status: 200 })
  }
}
