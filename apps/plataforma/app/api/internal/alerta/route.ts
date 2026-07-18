// /api/internal/alerta — Puerta de notificación Telegram para rutinas de Claude Code.
// Las rutinas efímeras NO tienen TELEGRAM_BOT_TOKEN propio; llaman aquí para avisar.
//
// Auth (basta con UNO):
//   1. Bearer = ALERTA_TOKEN — token DEDICADO y de bajo privilegio, que SOLO abre este
//      endpoint. Es el que se pone en el prompt de las rutinas: si se filtra, lo único que
//      permite es mandar un Telegram (no aplicar precios ni pegar a otros crons). **Header-only
//      (sin `?secret=`)**: como es el token que viaja en prompts, no lo dejamos ir por la URL
//      (query strings se filtran por logs de acceso / Referer). Las rutinas ya lo mandan por cabecera.
//   2. Bearer/?secret = CRON_SECRET — el Bearer maestro de todos los crons (compatibilidad
//      hacia atrás mientras se migran los prompts; conviene NO usarlo aquí a futuro).
// POST { text: string, html?: boolean }.
import { NextRequest, NextResponse } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ALERTA_TOKEN (bajo privilegio, header-only) o CRON_SECRET maestro. La lógica compartida vive en
  // lib/cron-auth::isRoutineAuthorized (misma que usan los endpoints de la rutina trading-analista).
  if (!isRoutineAuthorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const body = await req.json().catch(() => null)
  if (!body?.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text requerido' }, { status: 400 })
  }
  const messageId = await tgSend(body.text, { html: body.html !== false })
  return NextResponse.json({ ok: true, messageId })
}
