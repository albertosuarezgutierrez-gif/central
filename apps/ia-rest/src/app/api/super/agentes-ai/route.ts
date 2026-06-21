export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAISearch } from '@/lib/ai-client'

// Agente de búsqueda web del god-panel. Migrado de Anthropic (web_search, sin saldo) a
// **Gemini** (búsqueda web nativa + síntesis) vía callAISearch — gratis/barato, sin Anthropic.
// callAISearch cae a NIM si no hay GEMINI_API_KEY.
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const { messages, systemPrompt } = body
    if (!messages || !systemPrompt)
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

    const historia = (messages as any[])
      .map(m => `[${m.role === 'user' ? 'Usuario' : 'Asistente'}]: ${m.content}`)
      .join('\n')
    const ultimo = (messages as any[]).filter(m => m.role === 'user').slice(-1)[0]?.content ?? historia
    const consulta = messages.length > 1 ? `Conversación previa:\n${historia}\n\nConsulta actual: ${ultimo}` : String(ultimo)

    const text = await callAISearch(systemPrompt, consulta, 2048)
    return NextResponse.json({ text: text || 'Sin respuesta.' })
  } catch (err: any) {
    console.error('[agentes-ai]', err)
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
