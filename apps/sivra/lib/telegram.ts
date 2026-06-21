// lib/telegram.ts — notificaciones del operador vía Telegram (portado de ia-rest).
// Variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. "Best effort": nunca lanza.

const EMOJI: Record<string, string> = { critico: '🔴', aviso: '🟡', info: '🔵', resuelto: '✅' }

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function tgAlert(
  mensaje: string,
  nivel: 'critico' | 'aviso' | 'info' | 'resuelto' = 'info',
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) { console.warn('[tgAlert] sin TELEGRAM_BOT_TOKEN/CHAT_ID'); return }
  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  const text = `${EMOJI[nivel]} <b>SIVRA</b>\n${mensaje}\n<i>${hora}</i>`
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
    const data = await res.json()
    if (!data.ok) console.error('[tgAlert] Telegram error:', data.description)
  } catch (err: any) {
    console.error('[tgAlert] fetch error:', err?.message)
  }
}

// Mensaje con botones inline (p.ej. Aprobar/Descartar un gasto en bandeja).
export async function tgAlertButtons(
  mensaje: string,
  nivel: 'critico' | 'aviso' | 'info' | 'resuelto',
  botones: Array<{ texto: string; url?: string; callback?: string }[]>,
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  const text = `${EMOJI[nivel] || '🔵'} <b>SIVRA</b>\n${mensaje}\n<i>${hora}</i>`
  const reply_markup = {
    inline_keyboard: botones.map((fila) =>
      fila.map((b) => (b.url ? { text: b.texto, url: b.url } : { text: b.texto, callback_data: b.callback || '' })),
    ),
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true }),
    })
    const data = await res.json()
    return data?.result?.message_id ?? null
  } catch {
    return null
  }
}

export { escapeHtml }
