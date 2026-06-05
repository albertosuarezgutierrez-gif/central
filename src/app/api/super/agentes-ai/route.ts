export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  const AVISO_ANTHROPIC = '⚠️ Esta función usa búsqueda web/herramientas vía Anthropic, que ahora mismo no está disponible (sin crédito). El resto del panel funciona con normalidad.'
  if (!apiKey)
    return NextResponse.json({ error: AVISO_ANTHROPIC }, { status: 500 })

  try {
    const body = await req.json()
    const { messages, systemPrompt } = body

    if (!messages || !systemPrompt)
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

    // Primera llamada con web_search
    const res1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages,
      }),
    })

    const data1 = await res1.json()

    // Si no usó tool_use, devolver directamente
    if (data1.stop_reason !== 'tool_use') {
      const text = (data1.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
      return NextResponse.json({ text })
    }

    // Segunda vuelta: incluir tool_result para que el modelo complete
    const toolUseBlock = data1.content.find((b: any) => b.type === 'tool_use')
    const toolResultContent = data1.content
      .filter((b: any) => b.type === 'tool_result')
      .map((b: any) => b.content)
      .flat()

    const messagesWithTool = [
      ...messages,
      { role: 'assistant', content: data1.content },
      {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUseBlock?.id || 'tool_1',
          content: toolResultContent.length > 0
            ? toolResultContent
            : 'Búsqueda completada. Proporciona recomendaciones concretas basadas en los resultados y el contexto de ia.rest.',
        }],
      },
    ]

    const res2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: messagesWithTool,
      }),
    })

    const data2 = await res2.json()
    const text = (data2.content || [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    return NextResponse.json({ text: text || 'Sin respuesta del agente.' })

  } catch (err: any) {
    console.error('[agentes-ai]', err)
    const m = String(err?.message || err)
    const sinSaldo = /credit balance|too low|insufficient|x-api-key|authentication|\b401\b|\b403\b/i.test(m)
    return NextResponse.json({ error: sinSaldo ? AVISO_ANTHROPIC : m }, { status: 500 })
  }
}
