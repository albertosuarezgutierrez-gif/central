// lib/sivra/agente-huesped/telegram-msg.ts — propuesta por Telegram + estado pendiente.
import { escapeHtml, tgAviso, tgAvisoBotones, tgEditMessage, type Boton } from '@/lib/telegram'
import { aiComplete } from '@central/core-ai'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Decision } from './decidir'
import type { Contexto } from './contexto'
import { necesitaTraduccionPregunta, traduccionUtil, lineaTraduccion, tipoHueco } from './reglas'
import { derivaAEspanol, asegurarIdioma } from './idioma-salida'
import { enviarAlHuespedDetallado, type ResultadoEnvio } from './enviar'
import { crearTareaIntranet } from '@/lib/sivra/extras/orden-limpieza'
import {
  peticionCambioHorario, resolverTipo, evaluarCambioHorario, extraerHoraPedida, botonesCambioHorario,
  textoNegativa, textoAceptacion, tareaLimpieza, mencionaMaletas, asegurarCallback,
  type PeticionHorario, type ReservaHorario, type Semaforo,
} from './cambio-horario'

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
  // Entrada anticipada / salida tardía / maletas: propuesta propia con semáforo (nunca auto-envío).
  const pet = peticionCambioHorario(pregunta, dec.categoria)
  if (pet) return proponerCambioHorario(ctx, pregunta, dec, pet)
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
  // Ya contestado a mano (Smoobu/Booking/WhatsApp): cierra el pendiente sin enviar nada.
  else botones.push([{ texto: '✋ Ya respondido', callback: `hsp_done:${ctx.bookingId}` }])
  // El «mensaje del huésped» lo escribió Alberto fuera de Smoobu y llegó sin marca de emisor
  // (reserva 154692216): se registra como nuestro para que el anti-eco no vuelva a tomarlo por pregunta.
  botones.push([{ texto: '🙋 Ese mensaje es mío', callback: `hsp_mine:${ctx.bookingId}` }])
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
    [{ texto: '🔧 Retocar sobre el borrador', callback: `hsp_tune:${pend.booking_id}` }, { texto: '✋ Ya respondido', callback: `hsp_done:${pend.booking_id}` }],
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

export async function confirmarRespondidoFuera(messageId: number | null): Promise<void> {
  if (messageId) await tgEditMessage(messageId, '✋ Respondido fuera del agente — pendiente cerrado, no se envió nada.')
}

export async function confirmarEsMio(messageId: number | null): Promise<void> {
  if (messageId) await tgEditMessage(messageId, '🙋 Anotado: ese mensaje era tuyo, no del huésped. Pendiente cerrado y no volveré a tomarlo por pregunta.')
}

export async function confirmarDescartado(messageId: number | null): Promise<void> {
  if (messageId) await tgEditMessage(messageId, '🚫 Descartado — no se envió respuesta al huésped.')
}


// ───────────────────────── ENTRADA ANTICIPADA / SALIDA TARDÍA / MALETAS ─────────────────────────
// Decisión de Alberto (03/10/2026): estas peticiones NUNCA salen solas. La propuesta lleva semáforo
// (¿lo permite el calendario del piso?), la reserva colindante y cuatro botones; los textos son
// GRATIS (sin coste) y sin petición de reseña. Lógica pura en `cambio-horario.ts`.

const EMOJI_SEMAFORO: Record<Semaforo, string> = { rojo: '🔴', verde: '🟢', amarillo: '🟡' }

/**
 * Reservas del MISMO piso, deduplicadas por `reservationId` y SIN las de `reservas_canceladas`.
 * `null` = no se pudo leer (≠ `[]` = no hay ninguna): el semáforo no puede ser verde con un null.
 */
export async function cargarReservasPropiedad(propertyId: string): Promise<ReservaHorario[] | null> {
  if (!propertyId || propertyId === 'all') return null
  try {
    return await prisma.$queryRaw<ReservaHorario[]>(Prisma.sql`
      SELECT DISTINCT ON (i."reservationId")
             i."reservationId"::text AS "reservationId",
             i."guestName" AS huesped,
             (i."checkIn" AT TIME ZONE 'Europe/Madrid')::date::text AS "checkIn",
             (i."checkOut" AT TIME ZONE 'Europe/Madrid')::date::text AS "checkOut"
      FROM incomes i
      WHERE i."propertyId" = ${propertyId}
        AND i."reservationId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM reservas_canceladas rc WHERE rc.reservation_id = i."reservationId")
      ORDER BY i."reservationId", i."createdAt" DESC, i."id" DESC
    `)
  } catch { return null }
}

type ReservaIncome = { guestName: string | null; checkIn: string | null; checkOut: string | null }
async function cargarReserva(bookingId: string): Promise<ReservaIncome | null> {
  try {
    const r = await prisma.$queryRaw<ReservaIncome[]>(Prisma.sql`
      SELECT "guestName",
             (("checkIn") AT TIME ZONE 'Europe/Madrid')::date::text AS "checkIn",
             (("checkOut") AT TIME ZONE 'Europe/Madrid')::date::text AS "checkOut"
      FROM incomes WHERE "reservationId" = ${bookingId} LIMIT 1
    `)
    return r[0] ?? null
  } catch { return null }
}

const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })

async function evaluarReserva(bookingId: string, propertyId: string, pet: PeticionHorario, pregunta: string, fechas: { checkIn: string | null; checkOut: string | null }) {
  const tipo = resolverTipo(pet, pregunta, { hoy: hoyMadrid(), checkIn: fechas.checkIn })
  const reservas = await cargarReservasPropiedad(propertyId)
  const ev = evaluarCambioHorario({ tipo, reserva: { reservationId: bookingId, ...fechas }, reservasMismaPropiedad: reservas })
  return { tipo, ev }
}

async function proponerCambioHorario(ctx: Contexto, pregunta: string, dec: Decision, pet: PeticionHorario): Promise<void> {
  const { tipo, ev } = await evaluarReserva(ctx.bookingId, ctx.propertyId, pet, pregunta, { checkIn: ctx.checkIn || null, checkOut: ctx.checkOut || null })
  const horaPedida = extraerHoraPedida(pregunta)
  const otroIdioma = ctx.lang !== 'es'
  const cabecera = `${EMOJI(dec.sentimiento === 'negativo')} <b>${escapeHtml(ctx.property)}</b> · ${escapeHtml(ctx.guestName)} (reserva ${ctx.bookingId})` +
    `\n📅 Entrada ${fmtFecha(ctx.checkIn)} · Salida ${fmtFecha(ctx.checkOut)}`

  // El «no» amable ya redactado (con consignas solo si aplica) y traducido al idioma del huésped.
  const noEs = textoNegativa({
    tipo, semaforo: ev.semaforo, propertyId: ctx.propertyId, nombre: ctx.guestName,
    ofrecerMaletas: ev.semaforo === 'rojo' || pet.tipo === 'equipaje' || mencionaMaletas(pregunta),
  })
  const [noIdioma, pregEsRaw] = await Promise.all([
    asegurarIdioma(noEs, ctx.lang),
    necesitaTraduccionPregunta(pregunta, ctx.lang) ? traducirEs(pregunta) : Promise.resolve(''),
  ])
  const preguntaEs = traduccionUtil(pregunta, pregEsRaw)
  const idiomaNota = otroIdioma ? ` <i>(en ${ctx.lang.toUpperCase()})</i>` : ''
  const etiqueta = (tipo === 'salida' ? 'salida tardía' : 'entrada anticipada') + (pet.tipo === 'equipaje' ? ' · maletas' : '')
  const col = ev.colindante
  const cuerpo = `<b>Huésped:</b> ${escapeHtml(pregunta)}` +
    lineaTraduccion(preguntaEs, otroIdioma, escapeHtml) +
    `\n\n${EMOJI_SEMAFORO[ev.semaforo]} <b>Semáforo ${ev.semaforo.toUpperCase()}</b> — ${etiqueta}` +
    (horaPedida ? ` · pide ${horaPedida}` : ' · no he podido sacar la hora pedida') +
    `\n<i>${escapeHtml(ev.motivo)}</i>` +
    (col ? `\n👥 <b>Colindante:</b> ${escapeHtml(col.huesped || 'otra reserva')} (reserva ${escapeHtml(String(col.reservationId))}) · entrada ${fmtFecha(col.checkIn || '')} · salida ${fmtFecha(col.checkOut || '')}` : '') +
    `\n\n<b>Si pulsas ❌ No, saldrá${idiomaNota}:</b>\n${escapeHtml(noIdioma.texto)}` +
    (noIdioma.fallo ? avisoIdiomaEquivocado(ctx.lang) : lineaTraduccion(otroIdioma ? noEs : '', otroIdioma, escapeHtml)) +
    `\n\n<i>Gratis: ningún texto menciona coste ni pide reseña. 🧹 Consultar limpieza solo deja nota — no envía nada al huésped.</i>`

  const botones: Boton[][] = botonesCambioHorario({ bookingId: ctx.bookingId, tipo, semaforo: ev.semaforo, horaPedida })
  // Salida de emergencia (no es decisión de las cuatro acciones): redactar a mano o cerrar si ya está contestado.
  botones.push([
    { texto: '✏️ Modificar', callback: asegurarCallback(`hsp_edit:${ctx.bookingId}`) },
    { texto: '✋ Ya respondido', callback: asegurarCallback(`hsp_done:${ctx.bookingId}`) },
  ])
  const mid = await tgAvisoBotones('huespedes.borrador', `${cabecera}\n\n${cuerpo}`, botones)
  // `borrador` = el «no» (lo que enviaría ❌ No y lo que Modificar/Retocar tomarían como base).
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_pendientes_tg (booking_id, property_id, borrador, categoria, tg_message_id, esperando_edit, esperando_retoque, idioma, pregunta, hueco_guia, no_requiere_respuesta, recordatorio_at, acuse_espera_at)
    VALUES (${ctx.bookingId}, ${ctx.propertyId}, ${noIdioma.texto}, ${dec.categoria}, ${mid}, false, false, ${ctx.lang}, ${pregunta || ''}, false, false, NULL, NULL)
    ON CONFLICT (booking_id) DO UPDATE SET borrador = ${noIdioma.texto}, categoria = ${dec.categoria}, tg_message_id = ${mid}, esperando_edit = false, esperando_retoque = false, idioma = ${ctx.lang}, pregunta = ${pregunta || ''}, hueco_guia = false, no_requiere_respuesta = false, created_at = now(), recordatorio_at = NULL, acuse_espera_at = NULL
  `).catch(() => {})
}

type PendCambio = { booking_id: string; property_id: string | null; idioma: string | null; pregunta: string | null; categoria: string | null }

export type ResultadoAceptacion = {
  ok: boolean
  /** Texto corto para el toast del botón. */
  toast: string
  /** HTML para un mensaje aparte (aviso de por qué no se envió, o resumen de la tarea). */
  aviso: string
  /** Mensaje que salió al huésped (solo si ok). */
  enviado?: string
  /** Fallo de Smoobu: el webhook lo traduce con `avisoFalloEnvio`. */
  fallo?: Extract<ResultadoEnvio, { ok: false }>
}

/**
 * ✅ Sí / 🕐 Sí, hasta HH: vuelve a mirar el calendario (puede haber entrado una reserva desde que se
 * propuso), manda el mensaje al huésped en SU idioma y crea la tarea en /invitado/limpieza. Si el
 * calendario está ahora en ROJO, no envía nada. Si la tarea no se pudo crear, se DECLARA.
 */
export async function aceptarCambioHorario(pend: PendCambio, hora: string): Promise<ResultadoAceptacion> {
  const bookingId = pend.booking_id
  const propertyId = pend.property_id || ''
  const pregunta = pend.pregunta || ''
  const pet = peticionCambioHorario(pregunta, pend.categoria)
  if (!pet) return { ok: false, toast: 'No se pudo', aviso: '🛑 No reconozco la petición de este pendiente. Usa ✏️ Modificar.' }
  const res = await cargarReserva(bookingId)
  if (!res) return { ok: false, toast: 'No se pudo leer la reserva', aviso: '🛑 <b>No he podido leer la reserva</b> (fechas): no envío una promesa a medias. Usa ✏️ Modificar.' }
  const fechas = { checkIn: res.checkIn, checkOut: res.checkOut }
  const { tipo, ev } = await evaluarReserva(bookingId, propertyId, pet, pregunta, fechas)
  if (ev.semaforo === 'rojo') {
    return { ok: false, toast: 'Ahora está en rojo', aviso: `🔴 <b>No se ha enviado nada.</b> El calendario está ahora en rojo: ${escapeHtml(ev.motivo)}\nPulsa ❌ No o ✏️ Modificar.` }
  }
  const idioma = pend.idioma || 'es'
  const es = textoAceptacion({ tipo, hora, nombre: res.guestName })
  const traducido = await asegurarIdioma(es, idioma)
  if (traducido.fallo) {
    return { ok: false, toast: 'No pude traducirlo', aviso: `🛑 <b>No se ha enviado nada:</b> no he podido traducir el mensaje a ${escapeHtml(idioma.toUpperCase())}. Usa ✏️ Modificar.` }
  }
  const envio = await enviarAlHuespedDetallado(bookingId, traducido.texto)
  if (!envio.ok) return { ok: false, toast: envio.motivo.reintentable ? 'No se pudo enviar — reintenta' : 'No se pudo enviar — mira el aviso', aviso: '', fallo: envio }

  const t = tareaLimpieza({ tipo, hora, checkIn: res.checkIn, checkOut: res.checkOut, huesped: res.guestName, reservationId: bookingId })
  // `crearTareaIntranet` toma la fecha de `checkIn`: aquí es la fecha de la tarea (salida o entrada).
  // El mensaje YA salió: un fallo aquí no puede propagarse; se declara con el aviso de «tarea NO creada».
  let tareaId: string | null = null
  if (t.fecha) {
    try {
      tareaId = await crearTareaIntranet({ piso: propertyId, checkIn: t.fecha, titulo: t.texto, instruccion: t.texto, huesped: res.guestName || undefined, propertyId })
    } catch { tareaId = null }
  }
  const aviso = tareaId
    ? `🧹 Tarea creada para la limpieza el ${fmtFecha(t.fecha || '')}: <i>${escapeHtml(t.texto)}</i>`
    : `⚠️ <b>El mensaje salió, pero la tarea NO se ha creado</b> — la limpieza no lo ve. Créala a mano (🧹 Limpiadoras → Tareas): <i>${escapeHtml(t.texto)}</i>`
  return { ok: true, toast: 'Enviado ✅', aviso, enviado: traducido.texto }
}

/** Texto del «no»: debe estar en el idioma del huésped (si el borrador salió en español, no se manda). */
export function negativaListaParaEnviar(pend: { borrador: string | null; idioma: string | null }): boolean {
  return !!(pend.borrador || '').trim() && !derivaAEspanol(pend.borrador || '', pend.idioma || 'es')
}
