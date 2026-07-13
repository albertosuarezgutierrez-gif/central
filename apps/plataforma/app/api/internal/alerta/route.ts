// /api/internal/alerta — Puerta de notificación Telegram para rutinas de Claude Code.
// Las rutinas efímeras NO tienen TELEGRAM_BOT_TOKEN propio; lo llaman aquí.
// Auth: Bearer ALERTA_SECRET (token dedicado de bajo privilegio) — o CRON_SECRET como
// respaldo durante la migración. Header-only (sin ?secret=). POST { text, html? }.
import { NextRequest, NextResponse } from 'next/server'
import { isAlertaAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isAlertaAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text requerido' }, { status: 400 })
  }
  const messageId = await tgSend(body.text, { html: body.html !== false })
  return NextResponse.json({ ok: true, messageId })
}
