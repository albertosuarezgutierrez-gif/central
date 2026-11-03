// lib/sivra/agente-huesped/orquestador.ts — procesa el último mensaje del huésped de una reserva.
import { construirContexto } from './contexto'
import { detectLang, detectCategory, tipoHueco, vaARecomendador, esAutomatico, esPlantillaHost } from './reglas'
import { idiomaConocido } from './idiomas'
import { decidir, type Decision } from './decidir'
import { decidirAutoEnvio } from './auto'
import { peticionCambioHorario, respuestaConfirmaHorario } from './cambio-horario'
import { esModoNoche } from './noche'
import { acusarNocturno } from './noche-guardia'
import { aprendizajesRelevantes, hechosRelevantes } from './similitud'
import { recomendar } from './recomendar'
import { enviarAlHuesped } from './enviar'
import { proponerPorTelegram, avisarAutoEnviado } from './telegram-msg'
import { logMensaje, registrarGap } from './aprender'
import { claveDedup, claimMensaje, liberarMensaje } from './idempotencia'
import { esEcoPropio, normalizarTexto } from './atribucion'
import { importeSospechoso, hablaDePago } from './extras'
import { intentarCobroAutomatico } from '@/lib/sivra/extras/cobro-auto'
import { preciosVigentes } from '@/lib/sivra/extras/catalogo'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { esPeticionFactura, esTramiteFiscal } from './factura'
import { asegurarSolicitud } from '@/lib/sivra/facturas/servicio'
import { conEnlace } from '@/lib/sivra/facturas/enlace'
import { proponerSiCompleta, rellenarDesdeChat, solicitudVivaDe } from '@/lib/sivra/facturas/chat'


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
  // Diagnóstico de atribución (va a `mensajes_log.emisor_raw`): de dónde vino la pregunta y con qué
  // señales de Smoobu se decidió que era del huésped. Sin esto no se puede saber por qué un mensaje
  // del anfitrión escrito fuera de Smoobu se procesa como del huésped.
  const enHilo = [...ctx0.historial].reverse().find(h => normalizarTexto(h.text) === normalizarTexto(pregunta))
  const emisorDiag = {
    origen: opts.msgId?.startsWith('correo:') ? 'correo' : opts.pregunta ? 'sondeo' : 'historial',
    en_hilo: enHilo ? { from: enHilo.from, ...(enHilo.emisor || {}) } : null,
    ultimo_del_hilo: ctx0.historial.at(-1)?.from ?? null,
  }
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
  // Plantillas nuestras o de Smoobu que no pasaron por `enviarAlHuesped` (bienvenidas de Smoobu,
  // avisos de check-in online): el webhook no filtra por asunto como el sondeo, así que se mira aquí.
  if (!esManual && (esAutomatico('', pregunta) || esPlantillaHost(pregunta, ctx0.guestName))) return { accion: 'eco_plantilla' }

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
    const fallbackLang = idiomaConocido(ctx0.idiomaReserva) ? ctx0.idiomaReserva : 'en'
    const lang = detectLang(pregunta, fallbackLang)
    const categoria = detectCategory(pregunta) || 'general'
    // 1-ter) Recuperar lo ya aprendido que se PAREZCA a esta pregunta. `construirContexto` no puede
    // hacerlo: se ejecuta antes de saber cuál es la pregunta (puede salir del propio historial). Lo
    // que traía era «las 8 últimas filas del piso», que es lo que hacía que ocho «gracias a ti»
    // enterrasen lo enseñado — el «no aprende» de Alberto (04/09/2026). Ver `similitud.ts`.
    // `null` = no se pudo leer: se conserva lo que vino por recencia, nunca se vacía el prompt.
    const [aprendRelev, hechosRelev] = await Promise.all([
      aprendizajesRelevantes(ctx0.propertyId, pregunta),
      hechosRelevantes(ctx0.propertyId, pregunta),
    ])
    const ctx = {
      ...ctx0,
      lang,
      aprendizajes: aprendRelev ?? ctx0.aprendizajes,
      hechos: hechosRelev ? hechosRelev.map(h => h.hecho) : ctx0.hechos,
      // Solo si lo que se contesta ES ese mensaje: el sondeo puede traer uno más nuevo que el historial.
      preguntaTs: ultimoGuest && normalizarTexto(ultimoGuest.text) === normalizarTexto(pregunta) ? ultimoGuest.ts || undefined : undefined,
    }

    // 1-bis) ¿Es el «sí» a un extra que Alberto ya aprobó en este hilo? Entonces la respuesta es el
    // enlace de pago y no hay borrador que redactar. Todas las guardas viven en `intentarCobroAutomatico`
    // (fila `ofrecido` creada por el ✅ + aceptación limpia + importe de catálogo); cualquier duda
    // devuelve `enviado:false` y el mensaje sigue su camino normal hacia Telegram.
    const cobro = await intentarCobroAutomatico(ctx, pregunta)
    if (cobro.enviado) {
      await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: 'extra_cobro', pregunta, respuesta: '(enlace de pago)', fuente: 'catalogo', confidence: 1, sentimiento: 'neutro', needs_human: false, auto_sent: true, edited: false })
      return { accion: 'cobro_enlace_enviado' }
    }

    // 2) Recomendaciones → búsqueda web; resto → decisión IA con grounding.
    let dec: Decision
    if (vaARecomendador(pregunta, categoria)) {
      const reply = await recomendar(pregunta, ctx.zona, lang)
      dec = { reply, confidence: 0.6, needs_human: false, categoria: 'recomendacion', sentimiento: 'neutro', motivo: '', fuente: 'web' }
    } else {
      // 1-quater) FACTURA (27/10/2026): si el huésped la PIDE, se crea (o reutiliza) la solicitud y el borrador lleva el
      // enlace al formulario de datos fiscales. No cambia la política de envío: una petición de factura sigue pasando
      // SIEMPRE por Alberto (`needs_human` en decidir.ts y otra vez abajo). Si no se puede crear, el agente pide los
      // datos en el mensaje como antes y el motivo lo dice.
      let avisoEnlace = ''
      // 29/10/2026: los datos que el huésped da EN EL CHAT rellenan la solicitud (nunca pisan lo que ya rellenó en el
      // formulario; lo dudoso queda pendiente). Si queda completa y válida, `proponerSiCompleta` manda YA a Alberto el
      // borrador por Telegram (✅ Enviar / ✏️ Modificar), una sola vez por solicitud; nada se emite ni envía sin su ✅.
      // El texto al huésped (`ctx.facturaEstado`): completa → «tomo nota, te la envío en cuanto la revise» (sin fecha)
      // y sin enlace; incompleta → pide SOLO lo que falta (+ enlace). Un mensaje que SIGUE a una petición (p. ej. solo
      // los datos) usa la solicitud que ya existe, sin crear otra.
      const guestPrevios = ctx0.historial.filter(h => h.from === 'guest').map(h => h.text)
      const textosGuest = normalizarTexto(guestPrevios.at(-1) || '') === normalizarTexto(pregunta) ? guestPrevios : [...guestPrevios, pregunta]
      let solFactura: { id: string; url: string } | null = null
      if (esPeticionFactura(pregunta)) {
        const sol = await asegurarSolicitud(ctx.reservationId, 'agente').catch((e: unknown) => ({ ok: false as const, motivo: e instanceof Error ? e.message : 'fallo interno' }))
        if (sol.ok) solFactura = { id: sol.solicitudId, url: sol.url }
        else avisoEnlace = `NO he podido crear el enlace al formulario de factura (${sol.motivo}): el borrador pide los datos a mano; o créalo en /sivra/facturas.`
      } else if (esTramiteFiscal(pregunta, guestPrevios) && guestPrevios.some(t => esPeticionFactura(t))) {
        solFactura = await solicitudVivaDe(ctx.reservationId).catch(() => null)
      }
      if (solFactura) {
        const estadoFactura = await rellenarDesdeChat(solFactura.id, textosGuest).catch((e: unknown) => {
          console.warn('[agente-huesped] datos de factura desde el chat:', e instanceof Error ? e.message.slice(0, 120) : 'error')
          return null
        })
        if (estadoFactura) ctx.facturaEstado = estadoFactura
        if (!estadoFactura?.completa) ctx.enlaceFactura = solFactura.url
        else {
          // Fallar aquí no tumba la respuesta al huésped: el borrador se puede preparar a mano en /sivra/facturas.
          const p = await proponerSiCompleta(solFactura.id).catch((e: unknown) => {
            console.warn('[agente-huesped] borrador de factura desde el chat:', e instanceof Error ? e.message.slice(0, 120) : 'error')
            return null
          })
          if (p === null || (typeof p === 'object' && !p.ok)) avisoEnlace = `NO he podido preparar el borrador de la factura${p ? ` (${p.motivo})` : ''}: hazlo en /sivra/facturas (alta manual, misma reserva).`
          else if (typeof p === 'object' && p.propuesta !== 'enviada') avisoEnlace = 'borrador de la factura preparado, pero su Telegram con ✅ Enviar no ha salido: «Reenviar a Telegram» en /sivra/facturas.'
        }
      }
      dec = await decidir(ctx, pregunta, categoria)
      if (avisoEnlace) dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}${avisoEnlace}`
    }

    // Hueco de conocimiento: escalamos porque la respuesta no queda cubierta por las fuentes. Antes
    // solo se anotaba cuando NO había ni ficha ni guía, así que con la guía leída no se anotaría
    // nunca — y el hueco es justo lo que hay que enseñarle. No se anota lo sensible (queja/dinero),
    // que escala por política y no por ignorancia. Y `control_caido` TAMPOCO se anota: con el
    // clasificador mudo no se ha llegado a mirar si la guía lo cubre, así que apuntarlo como hueco
    // ensucia `mensajes_guia_gaps` con preguntas que sí estaban cubiertas.
    if (tipoHueco(dec) === 'guia') {
      await registrarGap(ctx.propertyId, pregunta)
    }

    // 2-bis) 🚨 GUARDRAIL DEL IMPORTE. El precio de un extra sale del catálogo y de ningún otro
    // sitio; si el borrador menciona una cifra en euros que no cuadra con él, es una cifra que se ha
    // inventado el modelo (o que arrastra de una guía desactualizada) y NO puede salir sola.
    if (dec.reply) {
      const precios = await preciosVigentes(ctx.propertyId)
      // `null` = no se pudo LEER el catálogo. No se puede validar el importe, así que tampoco se
      // puede afirmar que sea bueno: escala igual, pero diciendo la verdad de por qué.
      const sospechoso = precios === null ? null : importeSospechoso(dec.reply, precios)
      const noVerificable = precios === null && importeSospechoso(dec.reply, []) !== null
      if (sospechoso !== null || noVerificable) {
        dec.needs_human = true
        dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}` + (noVerificable
          ? 'Menciona un importe y NO he podido leer el catálogo de extras para comprobarlo.'
          : 'Menciona un importe que no está en el catálogo de extras — revísalo antes de enviarlo.')
      }
    }

    // 2-ter) 🚨 GUARDRAIL DEL PAGO (29/08/2026, dictado por Alberto tras el caso Raquel): coordinar
    // un cobro —cómo pagar, con qué método, a qué cuenta— NUNCA sale solo, ni aunque el importe sea
    // el del catálogo y la respuesta esté apoyada en fuente. El único cobro automático es el enlace
    // de `intentarCobroAutomatico` (paso 1-bis), atado por código; aquí el agente llegó a auto-enviar
    // «transferencia bancaria o Bizum. Te envío los datos por mensaje privado» — un canal inventado
    // y una promesa que nada iba a cumplir. Se mira también la PREGUNTA: si el huésped pregunta cómo
    // pagar y el cobro automático no aplicó, la respuesta la decide Alberto.
    if (hablaDePago(pregunta) || (dec.reply && hablaDePago(dec.reply))) {
      dec.needs_human = true
      dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}Habla de un pago (método/datos de cobro) — eso lo autorizas tú; el único cobro automático es el enlace de Stripe.`
    }

    // 2-quater) 🚨 COMPUERTA DE HORARIO (03/10/2026): entrar antes, salir más tarde o guardar maletas fuera
    // de la estancia NUNCA sale solo (ver `cambio-horario.ts`). Se marca aquí para que el log y el aviso
    // lo reflejen (needs_human); `decidirAutoEnvio` lo vuelve a exigir por si alguien salta este paso.
    const horarioOficial = { checkIn: ctx.horaCheckIn, checkOut: ctx.horaCheckOut }
    if (peticionCambioHorario(pregunta, dec.categoria, horarioOficial) || peticionCambioHorario(pregunta, categoria, horarioOficial)) {
      dec.needs_human = true
      dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}Petición de cambio de horario / maletas — la decides tú (semáforo y botones abajo).`
    } else if (dec.reply && respuestaConfirmaHorario(dec.reply, horarioOficial)) {
      dec.needs_human = true
      dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}El borrador acepta una hora de entrada/salida distinta de la oficial — solo la autorizas tú.`
    }

    // 2-quinquies) Enlace del formulario de factura: lo pone el CÓDIGO al final (el modelo no escribe URLs) y el
    // mensaje nunca sale solo (decisión de política: una factura la mira Alberto).
    if (ctx.enlaceFactura && dec.reply) {
      dec.reply = conEnlace(dec.reply, ctx.lang, ctx.enlaceFactura)
      dec.needs_human = true
      dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}lleva el enlace al formulario de datos fiscales; al rellenarlo te llegará el borrador de la factura`
    }
    // Datos completos desde el chat: sin enlace, y el mensaje TAMPOCO sale solo (una factura la mira Alberto).
    if (ctx.facturaEstado?.completa && dec.reply) {
      dec.needs_human = true
      dec.motivo = `${dec.motivo ? dec.motivo + ' · ' : ''}datos de facturación completos (sacados del chat y validados): te llega aparte el borrador de la factura con ✅ Enviar / ✏️ Modificar`
    }

    // 3) ¿Auto-envío o propuesta por Telegram? La regla vive en `auto.ts` (pura y testeada); aquí
    //    solo se ejecuta. Las dos vías y sus guardas están documentadas en ese módulo.
    const { auto: puedeAuto } = decidirAutoEnvio(dec, pregunta, horarioOficial)
    if (puedeAuto) {
      const ok = await enviarAlHuesped(ctx.reservationId, dec.reply)
      await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: false, auto_sent: ok, edited: false, emisor: emisorDiag })
      // Si el envío falló, liberamos el reclamo para reintentar en el próximo sondeo.
      if (!ok) await liberarMensaje(dedupKey)
      // Copia informativa a Telegram de lo que se ha enviado solo (Alberto no tiene que hacer nada).
      // Solo si de verdad se envió; best-effort, no bloquea ni rompe el flujo.
      else await avisarAutoEnviado(ctx, pregunta, dec)
      return { accion: ok ? 'auto_enviado' : 'fallo_envio' }
    }

    await proponerPorTelegram(ctx, pregunta, dec)
    await logMensaje({ bookingId, propertyId: ctx.propertyId, categoria: dec.categoria, pregunta, respuesta: dec.reply, fuente: dec.fuente, confidence: dec.confidence, sentimiento: dec.sentimiento, needs_human: dec.needs_human, auto_sent: false, edited: false, emisor: emisorDiag })
    // 4) MODO NOCHE (05/09/2026). Fuera del horario de atención, el borrador se queda en Telegram
    //    hasta que Alberto lo vea — y si escala a las 23:30, el huésped no recibe NADA hasta las
    //    09:00. Ese silencio es indistinguible, desde el código, de una conversación atendida. El
    //    modo noche NO redacta ni auto-envía respuestas: acusa recibo y, si es urgencia de acceso o
    //    avería, despierta a Alberto (ver `noche.ts`). Va DESPUÉS de proponer porque el barrido del
    //    último recurso se apoya en la fila de `mensajes_pendientes_tg` que crea la propuesta.
    if (esModoNoche()) await acusarNocturno(ctx, pregunta).catch(() => {})
    return { accion: 'propuesto_telegram' }
  } catch (e) {
    // Falló a mitad (IA caída, etc.): liberar el reclamo para no perder el mensaje (se reintenta).
    await liberarMensaje(dedupKey)
    throw e
  }
}
