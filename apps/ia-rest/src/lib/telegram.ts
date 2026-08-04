// lib/telegram.ts — notificaciones al operador
// Retorna Promise — usar con await para garantizar entrega
import { enviarEmailAvisoOperador } from '@/lib/email'
import { acumularAvisoOperador } from '@/lib/avisos'

const EMOJI: Record<string, string> = {
  critico:  '🔴',
  aviso:    '🟡',
  info:     '🔵',
  resuelto: '✅',
}

// tgAlert es el ÚNICO canal por el que los agentes/crons avisan al operador.
// Desde 20/07/2026 el canal por defecto es RESUMEN DIARIO por email (Alberto pidió
// no recibir más pings de Telegram y recibir un solo email al día). Reversible SIN
// desplegar con la env TGALERT_CANAL:
//   'resumen'  (default) → acumula en avisos_operador; el cron avisos-resumen manda
//                          UN email al día con todo. Telegram silenciado.
//   'email'              → un email inmediato por cada aviso (sin Telegram).
//   'telegram'           → comportamiento antiguo (solo Telegram).
//   'ambos'              → Telegram inmediato + acumula en el resumen diario.
// Nota: los avisos INTERACTIVOS con botones (tgEstudio, tgAlertButtons) NO pasan
// por aquí y siguen yendo por Telegram — el email no puede llevar botones y los
// agentes necesitan la respuesta para actuar.
export async function tgAlert(
  mensaje: string,
  nivel: 'critico' | 'aviso' | 'info' | 'resuelto' = 'critico'
): Promise<void> {
  const canal = (process.env.TGALERT_CANAL || 'resumen').toLowerCase()

  if (canal === 'resumen' || canal === 'ambos') {
    await acumularAvisoOperador(mensaje, nivel)
    if (canal === 'resumen') return
  }

  if (canal === 'email') {
    try {
      await enviarEmailAvisoOperador({ mensaje, nivel })
    } catch (err: any) {
      console.error('[tgAlert→email]', err?.message)
    }
    return
  }

  // canal 'telegram' o 'ambos' → Telegram
  const token   = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) {
    console.error('[tgAlert] Missing token or chat_id')
    return
  }

  const hora = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
  const text = `${EMOJI[nivel]} <b>ia.rest</b>\n${escapeHtml(mensaje)}\n<i>${hora}</i>`

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML' }),
    })
    const data = await res.json()
    if (!data.ok) {
      console.error('[tgAlert] Telegram error:', data.description || data.error)
    }
  } catch (err: any) {
    console.error('[tgAlert] Fetch error:', err?.message)
  }
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

export async function tgSendPhoto(photoUrl: string, caption: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, photo: photoUrl, caption, parse_mode: 'HTML' }),
  }).catch(() => {})
}

export async function tgAlertButtons(
  mensaje: string,
  nivel: 'critico'|'aviso'|'info'|'resuelto' = 'info',
  // Cada botón lleva callback (botón de acción) O url (abre enlace directo, p. ej. wa.me).
  botones: Array<{ texto: string; callback?: string; url?: string }[]>
): Promise<number|null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  const hora = new Date().toLocaleString('es-ES',{timeZone:'Europe/Madrid',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})
  const EMOJI: Record<string,string> = { critico:'🔴',aviso:'🟡',info:'🔵',resuelto:'✅' }
  const text = `${EMOJI[nivel]||'🔵'} <b>ia.rest</b>\n${mensaje}\n<i>${hora}</i>`
  const reply_markup = { inline_keyboard: botones.map(fila => fila.map(b =>
    b.url ? { text: b.texto, url: b.url } : { text: b.texto, callback_data: b.callback || '' }
  )) }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id, text, parse_mode:'HTML', reply_markup }),
  }).catch(()=>null)
  if (!res?.ok) return null
  const data = await res.json().catch(()=>null)
  return data?.result?.message_id ?? null
}
