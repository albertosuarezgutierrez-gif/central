// lib/telegram.ts — notificaciones operador vía Telegram
// Fire-and-forget, nunca bloquea la respuesta principal

const EMOJI: Record<string, string> = {
  critico:  '🔴',
  aviso:    '🟡',
  info:     '🔵',
  resuelto: '✅',
}

export function tgAlert(
  mensaje: string,
  nivel: 'critico' | 'aviso' | 'info' | 'resuelto' = 'critico'
): void {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return

  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  // HTML parse_mode — más robusto que MarkdownV2, no necesita escapado complejo
  const text = `${EMOJI[nivel]} <b>ia.rest</b>\n${escapeHtml(mensaje)}\n<i>${hora}</i>`

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
  }).catch((err) => { console.error('[tgAlert]', err?.message) })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
