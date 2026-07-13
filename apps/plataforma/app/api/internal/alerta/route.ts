// /api/internal/alerta — Puerta de notificación Telegram para rutinas de Claude Code.
// Las rutinas efímeras NO tienen TELEGRAM_BOT_TOKEN propio; llaman aquí para avisar.
//
// Auth (basta con UNO):
//   1. Bearer/?secret = ALERTA_TOKEN — token DEDICADO y de bajo privilegio, que SOLO abre
//      este endpoint. Es el que se pone en el prompt de las rutinas: si se filtra, lo único
//      que permite es mandar un Telegram (no aplicar precios ni pegar a otros crons).
//   2. Bearer/?secret = CRON_SECRET — el Bearer maestro de todos los crons (compatibilidad
//      hacia atrás mientras se migran los prompts; conviene NO usarlo aquí a futuro).
// POST { text: string, html?: boolean }.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

// Token estrecho, exclusivo de este endpoint. Si no está definido, este camino simplemente
// no autoriza (se cae al CRON_SECRET) — nunca cae a un literal (guardián de secretos).
function isAlertaTokenAuthorized(req: NextRequest): boolean {
  const token = process.env.ALERTA_TOKEN
  if (!token) return false
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const qs = new URL(req.url).searchParams.get('secret')
  return bearer === token || qs === token
}

export async function POST(req: NextRequest) {
  if (!isAlertaTokenAuthorized(req) && !isCronAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text requerido' }, { status: 400 })
  }
  const messageId = await tgSend(body.text, { html: body.html !== false })
  return NextResponse.json({ ok: true, messageId })
}
