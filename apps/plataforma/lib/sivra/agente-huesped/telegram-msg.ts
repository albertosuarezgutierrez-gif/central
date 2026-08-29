// lib/sivra/agente-huesped/telegram-msg.ts — propuesta por Telegram + estado pendiente.
import { tgSend, tgSendButtons, tgEditMessage, escapeHtml, type Boton } from '@central/core-telegram'
import { aiComplete } from '@central/core-ai'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Decision } from './decidir'
import type { Contexto } from './contexto'
import { necesitaTraduccionPregunta, traduccionUtil, lineaTraduccion } from './reglas'

const EMOJI = (urgente: boolean) => (urgente ? '🔴' : '💬')

// Traduce al español de España (para que Alberto entienda de un vistazo). Best-effort: si falla, ''.
async function traducirEs(txt: string): Promise<string> {
  if (!txt) return ''
  try {
    return (await aiComplete([{ role: 'user', content: txt }], { system: 'Traduce al español de España. Devuelve SOLO la traducción, sin comillas ni explicaciones. Si el texto ya está en español, devuélvelo tal cual.', maxTokens: 300 })).trim()
  } catch { return '' }
}

// Copia INFORMATIVA (sin botones) de una respuesta que el agente ya envió SOLO (categoría graduada).
// Alberto NO tiene que hacer nada: es solo para que vea lo que se está mandando en automático.
// El mensaje del huésped tiene que poder leerse SIEMPRE en español (línea 🔁, lo pidió Alberto
// 29/08/2026): la traducción se decide por el TEXTO (no solo por ctx.lang, que hereda el idioma
// de la reserva cuando el mensaje no da señal) y, si el mensaje está seguro en otro idioma y la
// traducción falla, el hueco se declara en vez de callarse.
export async function avisarAutoEnviado(ctx: Contexto, pregunta: string, dec: Decision): Promise<void> {
  const otroIdioma = ctx.lang !== 'es'
  const [pregEsRaw, respEsRaw] = await Promise.all([
    necesitaTraduccionPregunta(pregunta, ctx.lang) ? traducirEs(pregunta) : Promise.resolve(''),
    otroIdioma ? traducirEs(dec.reply || '') : Promise.resolve(''),
  ])
  const preguntaEs = traduccionUtil(pregunta, pregEsRaw)
  const respuestaEs = traduccionUtil(dec.reply || '', respEsRaw)
  const idiomaNota = otroIdioma ? ` <i>(en ${ctx.lang.toUpperCase()})</i>` : ''
  const cuerpo = `🤖 <b>Respuesta automática</b> · <b>${escapeHtml(ctx.property)}</b> · ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId})` +
    `\n\n<b>Huésped:</b> ${escapeHtml(pregunta)}` +
    lineaTraduccion(preguntaEs, otroIdioma, escapeHtml) +
    `\n\n<b>Enviado${idiomaNota}:</b>\n${escapeHtml(dec.reply || '')}` +
    lineaTraduccion(respuestaEs, otroIdioma, escapeHtml) +
    `\n\n<i>ℹ️ Solo para tu información — enviado sin tu intervención (categoría «${escapeHtml(dec.categoria)}»).</i>`
  await tgSend(cuerpo).catch(() => {})
}
// ¿Escalamos por FALTA DE INFORMACIÓN (y no por política: queja, dinero, cambios…)? Solo entonces
// tiene sentido decirle a Alberto que es un hueco de la guía y que su respuesta se va a aprender.
function huecoDeGuia(dec: Decision): boolean {
  return dec.needs_human && !dec.apoyada_en_fuente && /no cubre|no se pudo verificar/.test(dec.motivo || '')
}

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
  // Al huésped siempre se le responde en SU idioma (el borrador no se cambia). La pregunta se
  // traduce por lo que dice el TEXTO (necesitaTraduccionPregunta de reglas.ts), y un fallo de traducción con el
  // idioma ≠ es se declara en el aviso en vez de omitir la línea 🔁 en silencio.
  const otroIdioma = ctx.lang !== 'es'
  // En paralelo: dos traducciones secuenciales se acercaban al límite de tiempo de la función.
  const [pregEsRaw, borrEsRaw] = await Promise.all([
    necesitaTraduccionPregunta(pregunta, ctx.lang) ? traducirEs(pregunta) : Promise.resolve(''),
    otroIdioma && dec.reply ? traducirEs(dec.reply) : Promise.resolve(''),
  ])
  const preguntaEs = traduccionUtil(pregunta, pregEsRaw)
  const borradorEs = traduccionUtil(dec.reply || '', borrEsRaw)

  const noRespuesta = dec.requiere_respuesta === false
  const idiomaNota = otroIdioma ? ` <i>(en ${ctx.lang.toUpperCase()})</i>` : ''
  const cuerpo = `<b>Huésped:</b> ${escapeHtml(pregunta)}` +
    lineaTraduccion(preguntaEs, otroIdioma, escapeHtml) +
    `\n\n<b>Borrador${idiomaNota}:</b>\n${escapeHtml(dec.reply || '(sin borrador — escribe tú con Modificar)')}` +
    lineaTraduccion(borradorEs, otroIdioma && !!dec.reply, escapeHtml) +
    (noRespuesta ? `\n\nℹ️ <i>Parece un cierre de conversación — quizá no requiere respuesta.</i>` : '') +
    (dec.motivo ? `\n\n<i>${escapeHtml(dec.motivo)}</i>` : '') +
    // Si escalamos porque la pregunta NO queda cubierta por las fuentes, decirlo con nombre y
    // apellidos: es un hueco de conocimiento del piso, y lo que Alberto conteste se aprende.
    (huecoDeGuia(dec) ? `\n\n❓ <b>Esto no lo encuentro en la guía de ${escapeHtml(ctx.property)}.</b> Lo que le respondas se guarda como hecho de este piso y lo usaré la próxima vez.` : '')

  const botones: Boton[][] = [[
    { texto: '✅ Enviar', callback: `hsp_send:${ctx.bookingId}` },
    { texto: '✏️ Modificar', callback: `hsp_edit:${ctx.bookingId}` },
  ]]
  // Cierre de conversación (gracias/perfecto…): el agente avisa de que no hace falta responder y deja
  // descartar sin enviar nada (además de Enviar de cortesía, que sigue arriba).
  if (noRespuesta) botones.push([{ texto: '🚫 No responder', callback: `hsp_skip:${ctx.bookingId}` }])
  // Retocar: aplicar una instrucción corta sobre el borrador (no reescribir entero).
  if (dec.reply) botones.push([{ texto: '🔧 Retocar sobre el borrador', callback: `hsp_tune:${ctx.bookingId}` }])
  // Acción contextual: conceder late/early si la categoría lo pide.
  if (dec.categoria === 'late_checkout' || dec.categoria === 'early_checkin') {
    botones.push([{ texto: '🕒 Conceder', callback: `hsp_grant:${ctx.bookingId}` }])
  }
  const mid = await tgSendButtons(`${cabecera}\n\n${cuerpo}`, botones)
  // Guardamos el idioma del huésped para que, si Alberto modifica en español, se traduzca a SU idioma.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit, esperando_retoque, idioma, pregunta)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${dec.reply || ''}, ${dec.categoria}, ${mid}, false, false, ${ctx.lang}, ${pregunta || ''})
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${dec.reply || ''}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, esperando_retoque = false, idioma = ${ctx.lang}, pregunta = ${pregunta || ''}, created_at = now()
  `).catch(() => {})
}

// Re-propone un borrador tras ✏️ Modificar / 🔧 Retocar: muestra el texto FINAL que se va a enviar
// (en el idioma del huésped + 🔁 español para verificar) con los botones, y deja el pendiente listo
// para ✅ Enviar / volver a Modificar / Retocar. NO envía nada al huésped todavía → así Alberto
// SIEMPRE ve lo que sale (incluida la traducción) antes de mandarlo, y puede encadenar varias vueltas.
export async function reproponerBorrador(
  pend: { booking_id: string; idioma: string | null },
  borrador: string,
  opts: { borradorEs?: string } = {},
): Promise<void> {
  const idioma = pend.idioma || 'es'
  let borradorEs = opts.borradorEs || ''
  if (!borradorEs && idioma !== 'es' && borrador) borradorEs = await traducirEs(borrador)
  const idiomaNota = idioma !== 'es' ? ` <i>(en ${idioma.toUpperCase()})</i>` : ''
  const cuerpo = `✏️ <b>Borrador revisado${idiomaNota}</b> (reserva ${pend.booking_id}):\n${escapeHtml(borrador || '(vacío)')}` +
    lineaTraduccion(traduccionUtil(borrador, borradorEs), idioma !== 'es' && !!borrador, escapeHtml) +
    `\n\nRevísalo y dale a ✅ Enviar, o sigue ajustando.`
  const botones: Boton[][] = [
    [{ texto: '✅ Enviar', callback: `hsp_send:${pend.booking_id}` }, { texto: '✏️ Modificar', callback: `hsp_edit:${pend.booking_id}` }],
    [{ texto: '🔧 Retocar sobre el borrador', callback: `hsp_tune:${pend.booking_id}` }],
  ]
  const mid = await tgSendButtons(cuerpo, botones)
  // Guarda el nuevo borrador como pendiente (el ✅ Enviar mandará ESTE texto) y resetea los modos.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE mensajes_pendientes_tg
    SET borrador = ${borrador}, tg_message_id = ${mid}, esperando_edit = false, esperando_retoque = false, created_at = now()
    WHERE booking_id = ${pend.booking_id}
  `).catch(() => {})
}

export async function confirmarEnviado(messageId: number | null, texto: string): Promise<void> {
  if (messageId) await tgEditMessage(messageId, `✅ Enviado al huésped:\n\n${escapeHtml(texto)}`)
}

export async function confirmarDescartado(messageId: number | null): Promise<void> {
  if (messageId) await tgEditMessage(messageId, '🚫 Descartado — no se envió respuesta al huésped.')
}
