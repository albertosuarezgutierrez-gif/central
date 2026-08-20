// lib/sivra/agente-huesped/orquestador.ts — procesa el último mensaje del huésped de una reserva.
import { construirContexto } from './contexto'
import { detectLang, detectCategory } from './reglas'
import { decidir, type Decision } from './decidir'
import { recomendar } from './recomendar'
import { enviarAlHuesped } from './enviar'
import { proponerPorTelegram, avisarAutoEnviado } from './telegram-msg'
import { logMensaje, registrarGap } from './aprender'
import { claveDedup, claimMensaje, liberarMensaje } from './idempotencia'
import { esEcoPropio } from './atribucion'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const RE_RECO = /recomien|recommend|qué hacer|what to do|restaurante|restaurant|visit|ver en|things to do/i

// Idempotencia por id del mensaje. El llamador (sondeo/webhook) puede pasar la pregunta y el
// msgId directos del hilo de Smoobu — necesario porque /api/threads no trae `sent_by_owner`
// y /api/reservations/{id}/messages puede no etiquetar al emisor.
export async function procesarMensajeHuesped(
  bookingId: string,
  opts: { pregunta?: string; msgId?: string } = {},
): Promise<{ accion: string }> {
  // 1) Contexto (reserva + guía + historial si lo hay).
  const ctx0 = await construirContexto(bookingId, 'en')
  if (!ctx0) return { accion: 'sin_contexto' }

  // El agente SOLO responde al huésped. El sondeo (/api/threads) no trae `sent_by_owner`, así que
  // puede traernos como "pregunta" el ÚLTIMO mensaje del hilo aunque sea del HOST (p.ej. el mensaje
  // de bienvenida automático de Smoobu/Booking). El historial completo sí distingue emisor: si quien
  // habló el último fue el host, no hay nada pendiente que contestar → fuera. (Sin esto el agente
  // "respondía" a nuestro propio mensaje y encima en voz del huésped.)
  const ultimoMsg = ctx0.historial.at(-1)
  if (ultimoMsg?.from === 'host') return { accion: 'host_ultimo_sin_pregunta' }

  const ultimoGuest = [...ctx0.historial].reverse().find(h => h.from === 'guest')

  // La pregunta: la que pasa el llamador (fiable) o, si no, la última del historial.
  const pregunta = (opts.pregunta || ultimoGuest?.text || '').trim()
  const msgId = opts.msgId || ultimoGuest?.id || ''
  if (!pregunta) return { accion: 'sin_mensaje_huesped' }

  // Defensa anti-duplicado robusta (independiente del id de Smoobu): si YA ENVIAMOS una respuesta
  // a este huésped con fecha igual o posterior a su último mensaje, no hay nada que contestar.
  // Cubre el agujero del dedup por msgId: el sondeo (id de /api/threads) y el webhook (id del
  // historial, otra fuente) pueden generar claves distintas para el MISMO mensaje; y nuestro
  // propio envío saliente re-dispara `newMessage`, que con el desfase de Smoobu burla el guard
  // "último=host". Antes eso creaba una propuesta fantasma que el recordatorio horario repetía.
  // El disparo MANUAL (msgId `manual:…`) se salta este guard: sirve para re-proponer a propósito.
  const esManual = (opts.msgId || '').startsWith('manual:')

  // El agente NO se responde a sí mismo: si la "pregunta" coincide con una respuesta que YA enviamos,
  // es nuestro propio mensaje reapareciendo en el hilo (el sondeo pasa la pregunta directa de
  // /api/threads, que no marca el emisor; y Smoobu a veces tampoco lo etiqueta). El disparo manual se
  // exime a propósito. Esto cubre el caso aunque nuestro envío aún no figure en el historial de Smoobu.
  if (!esManual && esEcoPropio(pregunta, ctx0.enviados)) return { accion: 'eco_propio' }

  if (!esManual && ultimoGuest?.ts) {
    const tsGuest = new Date(ultimoGuest.ts)
    if (!isNaN(tsGuest.getTime())) {
      try {
        const yaResp = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
          SELECT count(*)::bigint AS n FROM mensajes_log
          WHERE booking_id = ${bookingId} AND auto_sent = true AND created_at >= ${tsGuest}
        `)
        if (Number(yaResp[0]?.n || 0) > 0) return { accion: 'ya_respondido' }
      } catch { /* best-effort: si la consulta falla, seguimos el flujo normal */ }
    }
  }

  // Anti-propuesta DUPLICADA del MISMO mensaje. El webhook (tiempo real) y el sondeo (cron) derivan el
  // id del mensaje de endpoints DISTINTOS de Smoobu (/api/reservations/{id}/messages vs /api/threads),
  // así que generan claves de dedup distintas y AMBOS superan el reclamo atómico → dos borradores en
  // Telegram para la misma pregunta. Como solo hay UNA fila pendiente por reserva (PK booking_id),
  // Alberto envía uno y el botón del OTRO queda muerto ("Ya no está disponible"). Si YA hay una
  // propuesta pendiente para esta reserva sobre esta MISMA pregunta, no creamos otra. El disparo
  // MANUAL se exime a propósito (sirve para re-proponer). El reclamo atómico de abajo sigue cubriendo
  // la carrera del MISMO id; esta guarda cubre la de ids distintos para el mismo mensaje.
  if (!esManual) {
    try {
      const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
      const yaPend = await prisma.$queryRaw<{ pregunta: string | null }[]>(Prisma.sql`
        SELECT pregunta FROM mensajes_pendientes_tg WHERE booking_id = ${bookingId} LIMIT 1
      `)
      if (yaPend[0] && norm(yaPend[0].pregunta || '') === norm(pregunta)) return { accion: 'ya_propuesto' }
    } catch { /* best-effort: si la consulta falla, seguimos el flujo normal */ }
  }

  // Idempotencia: clave por id de Smoobu o, si no llega (p.ej. el webhook no lo trae), por
  // reserva+contenido. RECLAMO ATÓMICO al entrar: si no lo reclamamos nosotros, ya se atendió →
  // fuera. Evita las propuestas/auto-envíos duplicados del MISMO mensaje en cada sondeo/webhook.
  const dedupKey = claveDedup(bookingId, msgId, pregunta)
  if (!(await claimMensaje(dedupKey))) return { accion: 'ya_procesado' }

  try {
    // Idioma de respuesta: el idioma en que ESCRIBE el huésped (lo pidió Alberto — se le responde en
    // SU idioma). Si el mensaje no da señal clara, se cae al idioma de la reserva en Smoobu.
    const IDIOMAS_OK = new Set(['es', 'en', 'fr', 'de', 'it'])
    const fallbackLang = (IDIOMAS_OK.has(ctx0.idiomaReserva) ? ctx0.idiomaReserva : 'en') as 'es' | 'en' | 'fr' | 'de' | 'it'
    const lang = detectLang(pregunta, fallbackLang)
    const categoria = detectCategory(pregunta) || 'general'
    const ctx = { ...ctx0, lang }

    // 2) Recomendaciones → búsqueda web; resto → decisión IA con grounding.
    let dec: Decision
    if (categoria === 'faq' || RE_RECO.test(pregunta)) {
      const reply = await recomendar(pregunta, ctx.zona, lang)
      dec = { reply, confidence: 0.6, needs_human: false, categoria: 'recomendacion', sentimiento: 'neutro', motivo: '', fuente: 'web' }
    } else {
      dec = await decidir(ctx, pregunta, categoria)
    }

    // Hueco de conocimiento: escalamos porque la respuesta no queda cubierta por las fuentes. Antes
    // solo se anotaba cuando NO había ni ficha ni guía, así que con la guía leída no se anotaría
    // nunca — y el hueco es justo lo que hay que enseñarle. No se anota lo sensible (queja/dinero),
    // que escala por política y no por ignorancia.
    if (dec.needs_human && !dec.apoyada_en_fuente && dec.categoria !== 'recomendacion'
        && dec.sentimiento !== 'negativo' && /no cubre|no se pudo verificar/.test(dec.motivo || '')) {
      await registrarGap(ctx.propertyId, pregunta)
    }

    // 3) ¿Auto-envío o propuesta por Telegram?
    // Guardas comunes: nunca se auto-envía nada que requiera ojo humano (sensible / negativo / dato
    // inventado / escalado IA) ni sin borrador ni con sentimiento negativo.
    const guardasOk = !dec.needs_human && !!dec.reply && dec.sentimiento !== 'negativo'
    // (a) CORTESÍA de fin de estancia (despedidas / agradecimientos / cierres puros): respuestas
    //     "siempre iguales" y de riesgo mínimo. Decisión de Alberto (26/07/2026).
    // (b) RESPUESTA APOYADA EN UNA FUENTE (20/08/2026, decisión de Alberto): si lo que contesta sale
    //     de la guía real del piso, de la ficha de la reserva o de los hechos que él ha enseñado, se
    //     manda solo. Esto SUSTITUYE a la graduación por categorías (`autoPermitido`), que era un
    //     contador de aprobaciones y no sabía nada de si la respuesta estaba respaldada: con la guía
    //     leída, la fuente es mejor criterio que la categoría.
    //     `apoyada_en_fuente` ya exige que la guía se haya podido leer y que nada la marque dudosa.
    const autoCortesia = guardasOk && dec.es_cortesia === true
    const autoApoyada = guardasOk && dec.requiere_respuesta !== false && dec.apoyada_en_fuente === true
    const puedeAuto = autoCortesia || autoApoyada
    if (puedeAuto) {
      const ok = await enviarAlHuesped(ctx.reservationId, dec.reply)
      await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: false, auto_sent: ok, edited: false })
      // Si el envío falló, liberamos el reclamo para reintentar en el próximo sondeo.
      if (!ok) await liberarMensaje(dedupKey)
      // Copia informativa a Telegram de lo que se ha enviado solo (Alberto no tiene que hacer nada).
      // Solo si de verdad se envió; best-effort, no bloquea ni rompe el flujo.
      else await avisarAutoEnviado(ctx, pregunta, dec)
      return { accion: ok ? 'auto_enviado' : 'fallo_envio' }
    }

    await proponerPorTelegram(ctx, pregunta, dec)
    await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: dec.needs_human, auto_sent: false, edited: false })
    return { accion: 'propuesto_telegram' }
  } catch (e) {
    // Falló a mitad (IA caída, etc.): liberar el reclamo para no perder el mensaje (se reintenta).
    await liberarMensaje(dedupKey)
    throw e
  }
}
