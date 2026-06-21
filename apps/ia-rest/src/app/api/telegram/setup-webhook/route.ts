export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return NextResponse.json({ error: 'Token no configurado' }, { status: 500 })
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://www.iarest.es/api/telegram/instagram-callback', allowed_updates: ['callback_query','message'], secret_token: process.env.TELEGRAM_WEBHOOK_SECRET ?? '' }),
  })
  const data = await res.json()
  const info = await (await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)).json()
  return NextResponse.json({ ok: data.ok, resultado: data, webhook: info.result })
}
