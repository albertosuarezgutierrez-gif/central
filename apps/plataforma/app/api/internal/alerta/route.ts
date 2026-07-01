// /api/internal/alerta — Puerta de notificación Telegram para rutinas de Claude Code.
// Las rutinas efímeras NO tienen TELEGRAM_BOT_TOKEN propio; lo llaman aquí con CRON_SECRET.
// Auth: Bearer CRON_SECRET (o ?secret=). POST { text: string, html?: boolean }.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text requerido' }, { status: 400 })
  }
  const messageId = await tgSend(body.text, { html: body.html !== false })
  return NextResponse.json({ ok: true, messageId })
}
