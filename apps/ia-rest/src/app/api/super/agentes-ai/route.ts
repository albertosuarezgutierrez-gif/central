export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const AVISO_ANTHROPIC = '⚠️ Esta función usa búsqueda web vía Anthropic, que ahora mismo no está disponible (sin crédito). El resto del panel funciona con normalidad.'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: AVISO_ANTHROPIC }, { status: 500 })

  try {
    const body = await req.json()
    const { messages, systemPrompt } = body
    if (!messages || !systemPrompt)
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

    let currentMessages = messages.map((m: any) => ({ role: m.role, content: m.content }))
    let finalText = ''
    let iterations = 0

    while (iterations < 10) {
      iterations++

      const res = await fetch('https://api.anthropic.com/v1/messages', {
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
          messages: currentMessages,
        }),
      })

      const data = await res.json()
      if (!data.content) { finalText = 'Error: sin respuesta del modelo.'; break }

      const texts = data.content.filter((b: any) => b.type === 'text')
      if (texts.length) finalText = texts.map((b: any) => b.text).join('')
      if (data.stop_reason === 'end_turn') break

      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter((b: any) => b.type === 'tool_use')
        currentMessages = [...currentMessages, { role: 'assistant', content: data.content }]

        const results = await Promise.all(
          toolUses.map(async (tu: any) => {
            const wsResult = data.content.find((b: any) => b.type === 'tool_result' && b.tool_use_id === tu.id)
            const result = wsResult?.content?.[0]?.text || 'Búsqueda completada.'
            return { type: 'tool_result', tool_use_id: tu.id, content: result }
          })
        )

        currentMessages = [...currentMessages, { role: 'user', content: results }]
        continue
      }
      break
    }

    return NextResponse.json({ text: finalText || 'Sin respuesta.' })
  } catch (err: any) {
    console.error('[agentes-ai]', err)
    const m = String(err?.message || err)
    const sinSaldo = /credit balance|too low|insufficient|x-api-key|authentication|\b401\b|\b403\b/i.test(m)
    return NextResponse.json({ error: sinSaldo ? AVISO_ANTHROPIC : m }, { status: 500 })
  }
}
