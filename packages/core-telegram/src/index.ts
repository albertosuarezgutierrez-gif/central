// @central/core-telegram — bot único del monorepo.
// Envs: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET.
// "Best effort": las funciones de red nunca lanzan.

const API = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`

export function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type Boton = { texto: string; url?: string; callback?: string }

// callback_data: "<prefix>_<action>:<arg1>:<arg2>..."  (prefix = vertical/feature, p.ej. "hsp")
export function parseCallback(data: string): { prefix: string; action: string; args: string[] } {
  if (!data) return { prefix: '', action: '', args: [] }
  const [head, ...args] = data.split(':')
  const us = head.indexOf('_')
  if (us < 0) return { prefix: head, action: '', args }
  return { prefix: head.slice(0, us), action: head.slice(us + 1), args }
}

export async function tgSend(text: string, opts: { chatId?: string; html?: boolean } = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: opts.html === false ? undefined : 'HTML', disable_web_page_preview: true }),
    })
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

// Foto por URL pública (Telegram la descarga él) o por bytes (multipart, para fotos que solo
// viven en nuestra BD y no tienen URL pública). Caption en HTML, máx 1024 chars (límite de Telegram).
export async function tgSendPhoto(
  foto: { url: string } | { data: Uint8Array; nombre?: string },
  caption: string,
  opts: { chatId?: string } = {},
): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  try {
    let res: Response
    if ('url' in foto) {
      res = await fetch(API(token, 'sendPhoto'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, photo: foto.url, caption: caption.slice(0, 1024), parse_mode: 'HTML' }),
      })
    } else {
      const form = new FormData()
      form.set('chat_id', chat_id)
      form.set('caption', caption.slice(0, 1024))
      form.set('parse_mode', 'HTML')
      form.set('photo', new Blob([foto.data as BlobPart]), foto.nombre || 'foto.jpg')
      res = await fetch(API(token, 'sendPhoto'), { method: 'POST', body: form })
    }
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

export async function tgSendButtons(text: string, botones: Boton[][], opts: { chatId?: string } = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  const reply_markup = {
    inline_keyboard: botones.map(fila => fila.map(b => b.url ? { text: b.texto, url: b.url } : { text: b.texto, callback_data: b.callback || '' })),
  }
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup, disable_web_page_preview: true }),
    })
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

export async function tgAnswerCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(API(token, 'answerCallbackQuery'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text?.slice(0, 200) }),
    })
  } catch {}
}

export async function tgEditMessage(messageId: number, text: string, opts: { chatId?: string } = {}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return
  try {
    await fetch(API(token, 'editMessageText'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    })
  } catch {}
}

// Pide texto libre ligado a la respuesta (force_reply). El webhook lee message.reply_to_message.
export async function tgAskForReply(text: string, opts: { chatId?: string } = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chat_id = opts.chatId || process.env.TELEGRAM_CHAT_ID
  if (!token || !chat_id) return null
  try {
    const res = await fetch(API(token, 'sendMessage'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', reply_markup: { force_reply: true, selective: false } }),
    })
    const d = await res.json()
    return d?.result?.message_id ?? null
  } catch { return null }
}

// Verifica el header secreto que Telegram envía en cada webhook. FAIL-CLOSED: sin
// TELEGRAM_WEBHOOK_SECRET no se acepta nada. Antes dejaba pasar todo si faltaba la env, y por este
// webhook se aprueban cosas con botones (pagos, envíos, borradores): un olvido de env no puede
// convertirlo en una puerta abierta a cualquiera que conozca la URL.
export function verifyTelegramWebhook(headerValue: string | null, secret = process.env.TELEGRAM_WEBHOOK_SECRET): boolean {
  if (!secret || !headerValue || headerValue.length !== secret.length) return false
  let diff = 0
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ headerValue.charCodeAt(i)
  return diff === 0
}

type UpdateTelegram = {
  callback_query?: { from?: { id?: number | string }; message?: { chat?: { id?: number | string } } }
  message?: { chat?: { id?: number | string } }
}

/**
 * ¿Viene el update del chat autorizado (el de Alberto)? El secreto del header solo prueba que lo
 * manda Telegram, NO quién pulsó: cualquiera que escriba al bot genera updates válidos. El bot solo
 * manda botones a TELEGRAM_CHAT_ID, así que un botón o mensaje de otro chat se ignora.
 * Sin chat permitido configurado → false (fail-closed). Un update sin chat reconocible → false.
 */
export function emisorAutorizado(update: UpdateTelegram, chatPermitido = process.env.TELEGRAM_CHAT_ID): boolean {
  if (!chatPermitido) return false
  const cb = update.callback_query
  const chat = cb ? (cb.message?.chat?.id ?? cb.from?.id) : update.message?.chat?.id
  return chat !== undefined && chat !== null && String(chat) === String(chatPermitido)
}
