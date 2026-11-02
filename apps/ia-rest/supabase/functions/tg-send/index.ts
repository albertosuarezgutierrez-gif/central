// tg-send v2 — envía mensaje Telegram directamente
// 02/11/2026: antes comparaba `x-secret` con un LITERAL escrito aquí (repo público) y lo llamaba el
// navegador → cualquiera escribía al chat de Alberto. Ahora: secreto `TG_SEND_SECRET` (env de Edge
// Functions) en `x-internal-secret`, fail-closed y en tiempo constante. Único llamador: la ruta de
// servidor de ia-rest `/api/super/tg-send` (sesión firmada super_admin).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { exigirServicioOSecreto } from '../_shared/auth-interna.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const denegado = exigirServicioOSecreto(req, 'TG_SEND_SECRET', 'x-internal-secret', cors)
  if (denegado) return denegado

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID')

  if (!token || !chatId) {
    return new Response(JSON.stringify({ error: 'Telegram no configurado' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let mensaje: unknown
  try { ({ mensaje } = await req.json()) } catch { mensaje = null }
  if (typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > 4000) return new Response(JSON.stringify({ error: 'Mensaje requerido' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

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