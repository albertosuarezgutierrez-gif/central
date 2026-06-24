// lib/sivra/agente-huesped/telegram-msg.ts — propuesta por Telegram + estado pendiente.
import { tgSendButtons, tgEditMessage, escapeHtml, type Boton } from '@central/core-telegram'
import { aiComplete } from '@central/core-ai'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Decision } from './decidir'
import type { Contexto } from './contexto'

const EMOJI = (urgente: boolean) => (urgente ? '🔴' : '💬')
// Categorías básicas que pueden graduarse a auto-respuesta (no sensibles).
const GRADUABLES = new Set(['wifi', 'acceso', 'checkin', 'checkout', 'parking', 'normas', 'contacto', 'faq'])

// Fecha YYYY-MM-DD → DD/MM/YYYY (deja igual cualquier otro formato).
function fmtFecha(f: string): string {
  const m = (f || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '?')
}

// Propone el borrador por Telegram con botones y guarda el estado pendiente (liga el booking).
export async function proponerPorTelegram(ctx: Contexto, pregunta: string, dec: Decision): Promise<void> {
  const urgente = dec.sentimiento === 'negativo'
  const cabecera = `${EMOJI(urgente)} <b>${escapeHtml(ctx.property)}</b> · ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId})` +
    `\n📅 Entrada ${fmtFecha(ctx.checkIn)} · Salida ${fmtFecha(ctx.checkOut)}`

  // Si el huésped escribe en OTRO idioma, traducir al español TANTO la pregunta COMO el borrador,
  // para que Alberto entienda de un vistazo qué le dicen y qué se le va a responder (lo pidió él).
  // Al huésped siempre se le responde en SU idioma (el borrador no se cambia).
  const traducir = async (txt: string) => {
    try {
      return (await aiComplete([{ role: 'user', content: txt }], { system: 'Traduce al español de España. Devuelve SOLO la traducción, sin comillas ni explicaciones.', maxTokens: 300 })).trim()
    } catch { return '' }
  }
  let preguntaEs = ''
  let borradorEs = ''
  if (ctx.lang !== 'es') {
    // En paralelo: dos traducciones secuenciales se acercaban al límite de tiempo de la función.
    ;[preguntaEs, borradorEs] = await Promise.all([
      pregunta ? traducir(pregunta) : Promise.resolve(''),
      dec.reply ? traducir(dec.reply) : Promise.resolve(''),
    ])
  }

  const idiomaNota = ctx.lang !== 'es' ? ` <i>(en ${ctx.lang.toUpperCase()})</i>` : ''
  const cuerpo = `<b>Huésped:</b> ${escapeHtml(pregunta)}` +
    (preguntaEs ? `\n<i>🔁 ${escapeHtml(preguntaEs)}</i>` : '') +
    `\n\n<b>Borrador${idiomaNota}:</b>\n${escapeHtml(dec.reply || '(sin borrador — escribe tú con Modificar)')}` +
    (borradorEs ? `\n<i>🔁 ${escapeHtml(borradorEs)}</i>` : '') +
    (dec.motivo ? `\n\n<i>${escapeHtml(dec.motivo)}</i>` : '')

  const botones: Boton[][] = [[
    { texto: '✅ Enviar', callback: `hsp_send:${ctx.bookingId}` },
    { texto: '✏️ Modificar', callback: `hsp_edit:${ctx.bookingId}` },
  ]]
  // Acción contextual: conceder late/early si la categoría lo pide.
  if (dec.categoria === 'late_checkout' || dec.categoria === 'early_checkin') {
    botones.push([{ texto: '🕒 Conceder', callback: `hsp_grant:${ctx.bookingId}` }])
  }
  // Graduar: aprobar y, a partir de ahora, responder esta categoría básica sola.
  if (dec.reply && GRADUABLES.has(dec.categoria)) {
    botones.push([{ texto: '✅ Aprobar y a partir de ahora solas', callback: `hsp_grad:${ctx.bookingId}` }])
  }

  const mid = await tgSendButtons(`${cabecera}\n\n${cuerpo}`, botones)
  // Guardamos el idioma del huésped para que, si Alberto modifica en español, se traduzca a SU idioma.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit, idioma)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${dec.reply || ''}, ${dec.categoria}, ${mid}, false, ${ctx.lang})
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${dec.reply || ''}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, idioma = ${ctx.lang}, created_at = now()
  `).catch(() => {})
}

export async function confirmarEnviado(messageId: number | null, texto: string): Promise<void> {
  if (messageId) await tgEditMessage(messageId, `✅ Enviado al huésped:\n\n${escapeHtml(texto)}`)
}
