// tg-send v1 — envía mensaje Telegram directamente
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  // Seguridad mínima: secret compartido
  const secret = req.headers.get('x-secret')
  if (secret !== 'iarest-tg-2026') {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

  if (!token || !chatId) {
    return new Response(JSON.stringify({ error: 'Telegram no configurado' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const { mensaje } = await req.json()
  if (!mensaje) return new Response(JSON.stringify({ error: 'Mensaje requerido' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  const text = `${mensaje}\n<i>${hora}</i>`

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })

  const result = await r.json()
  return new Response(JSON.stringify({ ok: result.ok, result }), {
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
})