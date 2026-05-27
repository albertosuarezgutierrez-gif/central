import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { callAI } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'

const FRUSTRATION_SIGNALS = [
  'no funciona', 'no entiendo', 'no sé cómo', 'no puedo', 'error',
  'fallo', 'roto', 'ayuda', 'socorro', 'no me sale', 'problema',
  'no aparece', 'no veo', 'perdido', 'qué hago', 'sigue sin', 'no sirve',
]

function hasFrustration(text: string): boolean {
  const lower = text.toLowerCase()
  return FRUSTRATION_SIGNALS.some(s => lower.includes(s))
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { messages, systemPrompt, context } = await req.json()
  if (!messages?.length || !systemPrompt) {
    return NextResponse.json({ error: 'Parámetros incorrectos' }, { status: 400 })
  }

  // Enriquecer el systemPrompt con el contexto dinámico si llega
  let enrichedPrompt = systemPrompt
  if (context && Object.keys(context).length > 0) {
    const lines: string[] = []
    if (context.turnoActivo !== undefined)
      lines.push(`Turno activo: ${context.turnoActivo ? 'SÍ' : 'NO — debe pulsar el banner naranja para iniciar turno'}`)
    if (context.mesaSeleccionada)
      lines.push(`Mesa seleccionada ahora: ${context.mesaSeleccionada}`)
    if (context.comandaAbierta !== undefined)
      lines.push(`Comanda abierta: ${context.comandaAbierta ? 'SÍ' : 'NO'}`)
    if (context.turnoFichado !== undefined)
      lines.push(`Fichaje personal activo: ${context.turnoFichado ? 'SÍ' : 'NO'}`)
    if (context.pathname)
      lines.push(`Pantalla actual: ${context.pathname}`)

    if (lines.length > 0) {
      enrichedPrompt += `\n\nESTADO ACTUAL DEL USUARIO:\n${lines.join('\n')}\nUsa este contexto para dar una respuesta específica y concreta.`
    }
  }

  const historial = (messages as { role: string; content: string }[])
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n')

  let reply = ''
  try {
    reply = await callAI(enrichedPrompt, historial, 300)
  } catch {
    return NextResponse.json({ error: 'Error al procesar' }, { status: 500 })
  }

  // Detectar frustración → escalar a Telegram
  const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
  const msgCount = messages.filter((m: { role: string }) => m.role === 'user').length
  const frustrated = (lastUserMsg && hasFrustration(lastUserMsg.content)) || msgCount >= 4

  if (frustrated) {
    const historialCorto = messages.slice(-4)
      .map((m: { role: string; content: string }) => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`)
      .join('\n')

    const pantalla = context?.pathname ?? 'desconocida'
    const ctx = context
      ? Object.entries(context)
          .filter(([k]) => k !== 'pathname')
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : ''

    await tgAlert(
      `🆘 <b>HelpChat — usuario necesita ayuda real</b>\n\n` +
      `<b>Pantalla:</b> ${pantalla}\n` +
      `${ctx ? `<b>Estado:</b> ${ctx}\n` : ''}` +
      `\n<b>Últimos mensajes:</b>\n${historialCorto}`,
      'aviso'
    ).catch(() => {}) // no bloquear si falla Telegram
  }

  return NextResponse.json({ reply, escalated: frustrated })
}
