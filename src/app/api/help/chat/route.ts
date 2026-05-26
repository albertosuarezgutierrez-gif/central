import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { messages, systemPrompt } = await req.json()
  if (!messages?.length || !systemPrompt) {
    return NextResponse.json({ error: 'Parámetros incorrectos' }, { status: 400 })
  }

  const historial = (messages as { role: string; content: string }[])
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n')

  try {
    const reply = await callAI(systemPrompt, historial)
    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json({ error: 'Error al procesar' }, { status: 500 })
  }
}
