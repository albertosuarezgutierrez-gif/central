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
  const text = `${EMOJI[nivel]} *ia\\.rest*\n${escapeMd(mensaje)}\n_${hora}_`

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'MarkdownV2' }),
  }).catch(() => {})
}

// MarkdownV2 requiere escapar estos caracteres
function escapeMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}
