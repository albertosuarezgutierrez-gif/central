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
  const text = `${EMOJI[nivel]} <b>ia.rest</b>\n${escapeHtml(mensaje)}\n<i>${hora}</i>`

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
  }).catch((err) => { console.error('[tgAlert]', err?.message) })
}

// Mensaje con botones inline — para aprobación de leads
export async function tgEstudio(leadId: string, estudio: {
  empresa: string
  resumen: string
  argumento: string
  modulos: string[]
  mrr: number
  puntuacion: number
  painPoints: string[]
}): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return

  const painStr = estudio.painPoints.slice(0, 2).map(p => `• ${p}`).join('\n')
  const modulosStr = estudio.modulos.slice(0, 4).join(' · ')

  const text = [
    `🎯 <b>Nuevo lead estudiado</b>`,
    ``,
    `<b>${escapeHtml(estudio.empresa)}</b>`,
    `${escapeHtml(estudio.resumen)}`,
    ``,
    `💡 <i>${escapeHtml(estudio.argumento)}</i>`,
    ``,
    `📦 ${escapeHtml(modulosStr)}`,
    `💰 ${estudio.mrr}€/mes · ⭐ ${estudio.puntuacion}/100`,
    ``,
    `❗ <b>Pain points:</b>`,
    escapeHtml(painStr),
    ``,
    `¿Genero propuesta y email?`,
  ].join('\n')

  const inline_keyboard = [
    [
      { text: '✅ Sí, generar propuesta', callback_data: `propuesta_ok:${leadId}` },
      { text: '❌ Descartar', callback_data: `propuesta_no:${leadId}` },
    ],
    [
      { text: '✏️ Cambiar foco', callback_data: `propuesta_foco:${leadId}` },
    ],
  ]

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard },
    }),
  }).catch((err) => { console.error('[tgEstudio]', err?.message) })
}

// Editar mensaje existente (para actualizar estado botones)
export async function tgEditMessage(messageId: number, text: string): Promise<void> {
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return

  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
    }),
  }).catch(() => {})
}

// Responder callback query (quita el spinner del botón)
export async function tgAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
  }).catch(() => {})
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
