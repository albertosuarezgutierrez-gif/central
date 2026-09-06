// lib/sivra/agente-huesped/telegram-msg.ts — propuesta por Telegram + estado pendiente.
import { escapeHtml, tgAviso, tgAvisoBotones, tgEditMessage, type Boton } from '@/lib/telegram'
import { aiComplete } from '@central/core-ai'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Decision } from './decidir'
import type { Contexto } from './contexto'
import { necesitaTraduccionPregunta, traduccionUtil, lineaTraduccion, tipoHueco } from './reglas'
import { derivaAEspanol } from './idioma-salida'

const EMOJI = (urgente: boolean) => (urgente ? '🔴' : '💬')

// Traduce al español de España (para que Alberto entienda de un vistazo). Best-effort: si falla, ''.
async function traducirEs(txt: string): Promise<string> {
  if (!txt) return ''
  try {
    return (await aiComplete([{ role: 'user', content: txt }], { system: 'Traduce al español de España. Devuelve SOLO la traducción, sin comillas ni explicaciones. Si el texto ya está en español, devuélvelo tal cual.', maxTokens: 300 })).trim()
  } catch { return '' }
}

// El borrador salió en ESPAÑOL con un huésped que escribe en otro idioma. Pedir su «traducción al
// español» devuelve el mismo texto y `traduccionUtil` la descarta → la línea 🔁 decía «no he podido
// traducirlo al español», que se lee como un fallo de traducción cuando el fallo es de REDACCIÓN.
// `decidir.ts` ya intenta corregirlo antes de llegar aquí; si no pudo, se dice con todas las letras.
function avisoIdiomaEquivocado(lang: string): string {
  return `\n<i>⚠️ <b>Este texto ha salido en ESPAÑOL</b> y el huésped escribe en ${lang.toUpperCase()} — reescríbelo con ✏️ Modificar antes de enviarlo.</i>`
}

// Copia INFORMATIVA (sin botones) de una respuesta que el agente ya envió SOLO (categoría graduada).
// Alberto NO tiene que hacer nada: es solo para que vea lo que se está mandando en automático.
// El mensaje del huésped tiene que poder leerse SIEMPRE en español (línea 🔁, lo pidió Alberto
// 29/08/2026): la traducción se decide por el TEXTO (no solo por ctx.lang, que hereda el idioma
// de la reserva cuando el mensaje no da señal) y, si el mensaje está seguro en otro idioma y la
// traducción falla, el hueco se declara en vez de callarse.
export async function avisarAutoEnviado(ctx: Contexto, pregunta: string, dec: Decision): Promise<void> {
  const otroIdioma = ctx.lang !== 'es'
  const respEnEspanol = derivaAEspanol(dec.reply || '', ctx.lang)
  const [pregEsRaw, respEsRaw] = await Promise.all([
    necesitaTraduccionPregunta(pregunta, ctx.lang) ? traducirEs(pregunta) : Promise.resolve(''),
    otroIdioma && !respEnEspanol ? traducirEs(dec.reply || '') : Promise.resolve(''),
  ])
  const preguntaEs = traduccionUtil(pregunta, pregEsRaw)
  const respuestaEs = traduccionUtil(dec.reply || '', respEsRaw)
  const idiomaNota = otroIdioma ? ` <i>(en ${ctx.lang.toUpperCase()})</i>` : ''
  const cuerpo = `🤖 <b>Respuesta automática</b> · <b>${escapeHtml(ctx.property)}</b> · ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId})` +
    `\n\n<b>Huésped:</b> ${escapeHtml(pregunta)}` +
    lineaTraduccion(preguntaEs, otroIdioma, escapeHtml) +
    `\n\n<b>Enviado${idiomaNota}:</b>\n${escapeHtml(dec.reply || '')}` +
    (respEnEspanol ? avisoIdiomaEquivocado(ctx.lang) : lineaTraduccion(respuestaEs, otroIdioma, escapeHtml)) +
    `\n\n<i>ℹ️ Solo para tu información — enviado sin tu intervención (categoría «${escapeHtml(dec.categoria)}»).</i>` +
    // El control de calidad caído ya no bloquea un intercambio de pura cortesía (`cortesia.ts`), pero
    // eso NO puede volverse invisible: hasta ahora la única señal de que el clasificador estaba mudo
    // era el aviso de revisión, y justo esos mensajes dejan de pedirla. Se declara aquí.
    (dec.sin_verificar
      ? `\n⚠️ <i>Salió <b>sin verificar</b>: el control de calidad no respondió. Se envió igual por ser pura cortesía (ni la pregunta pedía nada ni la respuesta da ningún dato). Si esto se repite, el clasificador lleva rato caído.</i>`
      : '')
  await tgAviso('huespedes.borrador', cuerpo).catch(() => {})
}
// ¿Escalamos por FALTA DE INFORMACIÓN (y no por política: queja, dinero, cambios…)? Solo entonces
// tiene sentido decirle a Alberto que es un hueco de la guía y que su respuesta se va a aprender.


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
  const borradorEnEspanol = derivaAEspanol(dec.reply || '', ctx.lang)
  const [pregEsRaw, borrEsRaw] = await Promise.all([
    necesitaTraduccionPregunta(pregunta, ctx.lang) ? traducirEs(pregunta) : Promise.resolve(''),
    otroIdioma && dec.reply && !borradorEnEspanol ? traducirEs(dec.reply) : Promise.resolve(''),
  ])
  const preguntaEs = traduccionUtil(pregunta, pregEsRaw)
  const borradorEs = traduccionUtil(dec.reply || '', borrEsRaw)

  const hueco = tipoHueco(dec)
  const noRespuesta = dec.requiere_respuesta === false
  const idiomaNota = otroIdioma ? ` <i>(en ${ctx.lang.toUpperCase()})</i>` : ''
  const cuerpo = `<b>Huésped:</b> ${escapeHtml(pregunta)}` +
    lineaTraduccion(preguntaEs, otroIdioma, escapeHtml) +
    `\n\n<b>Borrador${idiomaNota}:</b>\n${escapeHtml(dec.reply || '(sin borrador — escribe tú con Modificar)')}` +
    (borradorEnEspanol ? avisoIdiomaEquivocado(ctx.lang) : lineaTraduccion(borradorEs, otroIdioma && !!dec.reply, escapeHtml)) +
    (noRespuesta ? `\n\nℹ️ <i>Parece un cierre de conversación — quizá no requiere respuesta.</i>` : '') +
    (dec.motivo ? `\n\n<i>${escapeHtml(dec.motivo)}</i>` : '') +
    // Si escalamos porque la pregunta NO queda cubierta por las fuentes, decirlo con nombre y
    // apellidos: es un hueco de conocimiento del piso, y lo que Alberto conteste se aprende.
    // Hueco de guía y control de calidad caído NO son lo mismo, aunque los dos escalen: el primero es
    // conocimiento que falta (y lo que Alberto conteste se aprende como hecho), el segundo es que el
    // clasificador no respondió. Decir «no lo encuentro en la guía» con el control caído es afirmar un
    // hueco que nadie ha mirado — y hace parecer que el agente no aprende cuando el asunto SÍ está.
    // Datos traídos de internet: se dice de dónde salen. Un borrador con un precio o un horario que
    // no está en la guía solo es verificable si el aviso trae el enlace — sin eso, Alberto tendría
    // que buscarlo él, que es exactamente el trabajo que esto pretende ahorrarle.
    (dec.consulta_web === 'ok'
      ? `\n\n🔎 <b>Esto no está en la guía de ${escapeHtml(ctx.property)}: lo he consultado en internet.</b> Comprueba los datos antes de enviarlo.` +
        (dec.fuentes_web?.length
          ? `\n${dec.fuentes_web.slice(0, 4).map(u => `· ${escapeHtml(u)}`).join('\n')}`
          : `\n<i>· la búsqueda no citó ninguna fuente — verifícalo por tu cuenta antes de enviarlo</i>`) +
        `\nLo que le respondas se guarda como hecho de este piso y no tendré que buscarlo otra vez.`
      : dec.consulta_web === 'fallida'
      ? `\n\n⚠️ <b>Esto no está en la guía de ${escapeHtml(ctx.property)} y NO he podido consultarlo en internet</b> (la búsqueda falló). No es que el dato no exista: es que no lo he podido mirar.`
      : hueco === 'guia'
      ? `\n\n❓ <b>Esto no lo encuentro en la guía de ${escapeHtml(ctx.property)}.</b> Lo que le respondas se guarda como hecho de este piso y lo usaré la próxima vez.`
      : hueco === 'control_caido'
        ? `\n\n⚠️ <b>No he podido verificar el borrador</b> (el control de calidad no respondió). No significa que falte en la guía de ${escapeHtml(ctx.property)} — solo que esta vez no lo he podido comprobar.`
        : '')

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
  const mid = await tgAvisoBotones('huespedes.borrador', `${cabecera}\n\n${cuerpo}`, botones)
  // Guardamos el idioma del huésped para que, si Alberto modifica en español, se traduzca a SU idioma.
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit, esperando_retoque, idioma, pregunta, hueco_guia, no_requiere_respuesta, recordatorio_at, acuse_espera_at)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${dec.reply || ''}, ${dec.categoria}, ${mid}, false, false, ${ctx.lang}, ${pregunta || ''}, ${hueco === 'guia'}, ${noRespuesta}, NULL, NULL)
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${dec.reply || ''}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, esperando_retoque = false, idioma = ${ctx.lang}, pregunta = ${pregunta || ''}, hueco_guia = ${hueco === 'guia'}, no_requiere_respuesta = ${noRespuesta}, created_at = now(), recordatorio_at = NULL, acuse_espera_at = NULL
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
  const enEspanol = derivaAEspanol(borrador, idioma)
  let borradorEs = opts.borradorEs || ''
  if (!borradorEs && idioma !== 'es' && borrador && !enEspanol) borradorEs = await traducirEs(borrador)
  const idiomaNota = idioma !== 'es' ? ` <i>(en ${idioma.toUpperCase()})</i>` : ''
  const cuerpo = `✏️ <b>Borrador revisado${idiomaNota}</b> (reserva ${pend.booking_id}):\n${escapeHtml(borrador || '(vacío)')}` +
    (enEspanol ? avisoIdiomaEquivocado(idioma) : lineaTraduccion(traduccionUtil(borrador, borradorEs), idioma !== 'es' && !!borrador, escapeHtml)) +
    `\n\nRevísalo y dale a ✅ Enviar, o sigue ajustando.`
  const botones: Boton[][] = [
    [{ texto: '✅ Enviar', callback: `hsp_send:${pend.booking_id}` }, { texto: '✏️ Modificar', callback: `hsp_edit:${pend.booking_id}` }],
    [{ texto: '🔧 Retocar sobre el borrador', callback: `hsp_tune:${pend.booking_id}` }],
  ]
  const mid = await tgAvisoBotones('huespedes.borrador', cuerpo, botones)
  // Guarda el nuevo borrador como pendiente (el ✅ Enviar mandará ESTE texto) y resetea los modos.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE mensajes_pendientes_tg
    SET borrador = ${borrador}, tg_message_id = ${mid}, esperando_edit = false, esperando_retoque = false, created_at = now(),
        recordatorio_at = NULL, acuse_espera_at = NULL
    WHERE booking_id = ${pend.booking_id}
  `).catch(() => {})
}

export async function confirmarEnviado(messageId: number | null, texto: string): Promise<void> {
  if (messageId) await tgEditMessage(messageId, `✅ Enviado al huésped:\n\n${escapeHtml(texto)}`)
}

export async function confirmarDescartado(messageId: number | null): Promise<void> {
  if (messageId) await tgEditMessage(messageId, '🚫 Descartado — no se envió respuesta al huésped.')
}
