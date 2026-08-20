// lib/sivra/agente-huesped/decidir.ts — motor de decisión IA con grounding.
//
// DISEÑO (26/06/2026): la respuesta al huésped se genera como TEXTO PLANO, no como JSON.
// Antes el modelo debía devolver un único JSON {reply,confidence,needs_human,…}; cuando el
// modelo gratis (Llama 3.3 70B) fallaba al emitir JSON (pasaba incluso con un "Hola"), el
// agente se caía a un fallback que IGNORABA todo el system prompt y soltaba el texto crudo del
// modelo → borradores genéricos, sin contexto y sin reglas ("IA sin JSON — revisa el borrador").
// Como TODAS las reglas (continuar el hilo, REGLA DE ORO, early check-in…) vivían dentro del
// contrato JSON, un fallo de formato las anulaba de golpe → "sigue sin tener contexto".
//
// Ahora: (1) se genera la respuesta en texto plano con el hilo como contexto (las reglas se
// aplican SIEMPRE, no hay JSON que romper); (2) la decisión de escalar / sentimiento / si
// requiere respuesta se deriva aparte, de REGLAS + un clasificador de UNA palabra (ESCALAR/OK),
// mucho más fiable que un objeto JSON. Así un fallo de formato ya no puede vaciar el contexto.
import { aiComplete } from '@central/core-ai'
import type { Contexto } from './contexto'
import { contieneDatoInventado } from './guardrail'
import { esSensible } from './sensibilidad'
import { hiloComoMensajes } from './hilo'
import { faseReserva, aplicaEarlyCheckin } from './fases'
import { revisarCierre, bloqueCierre } from './cierre'
import { esSolicitudLateCheckout, esDespedida } from './reglas'
import { esLlegadaFueraDeHorario, HORARIO_ATENCION } from './llegada'

export type Decision = {
  reply: string
  confidence: number
  needs_human: boolean
  // false SOLO si el mensaje del huésped es un cierre/agradecimiento que no pide nada y, por tanto,
  // no requiere respuesta. Por defecto true (undefined = se trata como que sí requiere respuesta).
  requiere_respuesta?: boolean
  // true si el mensaje del huésped es una cortesía de fin de estancia (cierre puro o despedida/
  // agradecimiento) → una respuesta cálida "siempre igual", auto-enviable sin pasar por la graduación
  // por categoría, SIEMPRE que además pase las guardas (needs_human=false, sentimiento no negativo).
  es_cortesia?: boolean
  // true si la respuesta se apoya en una FUENTE real (ficha/guía/hechos del piso) y nada la marca
  // como dudosa. Es lo que autoriza el auto-envío desde el 20/08/2026: «si está en la guía, contesta
  // solo». Nunca es true si la guía no se pudo leer — eso es «no lo sé todavía», no «no hay guía».
  apoyada_en_fuente?: boolean
  categoria: string
  sentimiento: 'positivo' | 'neutro' | 'negativo'
  motivo: string
  fuente: 'ia' | 'web' | 'regla'
}

const LANG_NAME: Record<string, string> = { es: 'español', en: 'English', fr: 'français', de: 'Deutsch', it: 'italiano' }

// Modelo del agente de huéspedes. Por defecto VACÍO = usa el modelo por defecto de la pasarela
// (`z-ai/glm-5.2` desde el 17/08/2026 — el 3.3-70b deja de
// soportarse en NIM el 25/08/2026), que es el que de verdad sirve NIM y produce los borradores.
// El id "fuerte" `meta/llama-3.1-405b-instruct` que poníamos antes fue RETIRADO del catálogo de
// NVIDIA NIM → devolvía `HTTP 404: 404 page not found` en CADA mensaje (verificado en logs de
// producción el 06/07/2026). Quedaba enmascarado porque el reintento con el 70B por defecto
// respondía; el día que el 70B también falló (timeout) el agente cayó a "IA no disponible".
// Si en el futuro se quiere un modelo más capaz, poner en AGENTE_HUESPED_MODEL un id VERIFICADO
// como vivo en NIM: si está puesto, se intenta primero y, si falla, se reintenta con el 70B.
const MODELO_HUESPED = process.env.AGENTE_HUESPED_MODEL || ''

// Timeout por proveedor de la cadena de IA (NIM→Groq→Gemini→Kimi). Más corto que el default (30s)
// de la pasarela: cuando NIM se cuelga (causa real de los "IA no disponible" a Mirian y Julien —
// `The operation was aborted due to timeout` en logs), no queremos esperar 30s antes de caer al
// siguiente eslabón. 15s deja de sobra para una respuesta sana (500 tokens de Llama 70B tardan
// ~3-10s) y hace el failover a Groq/Gemini mucho más ágil. La ventana del webhook es 300s.
const HUESPED_TIMEOUT_MS = 15_000

// Cierre de conversación que no pide nada (no requiere respuesta obligatoria; se propone igual
// como cortesía). Solo cuando el mensaje es ÍNTEGRAMENTE una fórmula de cortesía/cierre.
const RE_CIERRE = /^(?:muchas\s+)?(?:gracias|graciass+|ok+|vale|perfecto|genial|estupendo|de acuerdo|entendido|recibido|buenas noches|buen día|hasta (?:luego|mañana|pronto)|thanks?|thank you|thx|great|perfect|cheers|merci|grazie|danke)[\s!.,😊👍🙏❤️]*$/i

function esCierre(text: string): boolean {
  return RE_CIERRE.test((text || '').trim())
}

function sentimientoDe(pregunta: string): Decision['sentimiento'] {
  if (/no funciona|aver[ií]a|roto|sucio|fatal|p[eé]simo|terrible|enfad|queja|inacept|asco|horrible|decepcion/i.test(pregunta)) return 'negativo'
  if (/gracias|gener?os|perfecto|encanta|estupendo|maravillos|excelente|gen?ial|todo (bien|perfecto|genial)|muy amable/i.test(pregunta)) return 'positivo'
  return 'neutro'
}

// Limpia adornos por si el modelo, pese a pedírsele texto plano, envuelve la respuesta en JSON,
// comillas o un prefijo tipo "Respuesta:".
function limpiarReply(raw: string): string {
  let t = (raw || '').replace(/```json|```/g, '').trim()
  // ¿Devolvió JSON con un campo reply? extrae el reply.
  if (t.startsWith('{') && /"reply"\s*:/.test(t)) {
    try {
      const obj = JSON.parse(t.match(/\{[\s\S]*\}/)?.[0] || t)
      if (obj && typeof obj.reply === 'string') t = obj.reply
    } catch { /* se queda con el texto tal cual */ }
  }
  t = t.replace(/^\s*(respuesta|reply|mensaje|draft|borrador)\s*:\s*/i, '').trim()
  // Quita comillas envolventes si las hubiera.
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('«') && t.endsWith('»'))) t = t.slice(1, -1).trim()
  return t
}

// Control de calidad: ¿la respuesta resuelve bien lo que pide el huésped o hay que escalar a Alberto?
// UNA sola palabra (ESCALAR/OK) — mucho más fiable que un JSON. Si la llamada falla, NO escala por
// sí misma (se apoya en las reglas: esSensible + sentimiento + guardrail).
// Tres estados a propósito. Antes devolvía boolean y el `catch` daba `false` = «no escales»: con la
// autonomía nueva eso significaría AUTO-ENVIAR cada vez que el clasificador se cae, que es convertir
// un «no he podido comprobarlo» en un «está comprobado». DESCONOCIDO escala como cualquier duda.
type Veredicto = 'ESCALAR' | 'OK' | 'DESCONOCIDO'

async function debeEscalar(ctx: Contexto, pregunta: string, reply: string): Promise<Veredicto> {
  const system = `Eres un control de calidad de un agente de atención al huésped de un alquiler turístico.
Te doy la INFORMACIÓN disponible del alojamiento, el último mensaje del huésped y el BORRADOR de respuesta.
Responde con UNA sola palabra, sin nada más:
ESCALAR → si el borrador no resuelve lo que pide el huésped, si la INFORMACIÓN no cubre la pregunta, o si el mensaje es una queja / pide dinero, cambios, cancelación o es una emergencia.
OK → si el borrador responde correctamente y con datos que están en la INFORMACIÓN.`
  const user = `INFORMACIÓN:
${ctx.ficha || '(sin ficha)'}
${ctx.guia ? `\nGUÍA:\n${ctx.guia}` : ''}

MENSAJE DEL HUÉSPED: ${pregunta}

BORRADOR: ${reply}`
  try {
    const out = await aiComplete([{ role: 'user' as const, content: user }], { system, maxTokens: 4, temperature: 0, timeoutMs: HUESPED_TIMEOUT_MS })
    if (/escalar/i.test(out || '')) return 'ESCALAR'
    if (/\bok\b/i.test(out || '')) return 'OK'
    return 'DESCONOCIDO'
  } catch {
    return 'DESCONOCIDO'
  }
}

export async function decidir(ctx: Contexto, pregunta: string, categoria: string): Promise<Decision> {
  const hechosTxt = (ctx.hechos || []).map(h => `- ${h}`).join('\n')
  const fuentes = [ctx.ficha || '', ctx.guia || '', hechosTxt, ctx.historial.map(h => h.text).join(' ')].join('\n')
  const aprend = ctx.aprendizajes.map(a => `P: ${a.pregunta_norm}\nR: ${a.respuesta_final}`).join('\n\n')

  const horario = (ctx.horaCheckIn || ctx.horaCheckOut)
    ? `\nHORARIO OFICIAL (dato exacto de la reserva — úsalo SIEMPRE para preguntas de hora de entrada/salida, NO seas vago): entrada a partir de las ${ctx.horaCheckIn || '—'}, salida (check-out) hasta las ${ctx.horaCheckOut || '—'}. La entrada NO tiene hora LÍMITE: "a partir de las ${ctx.horaCheckIn || '—'}" significa que se puede llegar a cualquier hora posterior, incluida la madrugada (ver LLEGADA TARDÍA en la INFORMACIÓN).`
    : ''

  // Fase temporal: pre-llegada / día de llegada / en-estancia / post-estancia (fecha Madrid, zona
  // horaria de los pisos). El DÍA DE LLEGADA es su propio caso: el huésped puede no haber entrado
  // aún (llega esa misma tarde), así que la entrada anticipada / dónde dejar el equipaje siguen
  // aplicando — antes caía en "ya está dentro" y el agente no ofrecía el early check-in el mismo día
  // de la entrada (lo detectó Alberto en el borrador a Gyongyi).
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
  const fase = faseReserva(hoy, ctx.checkIn, ctx.checkOut)
  const esPostEstancia = fase === 'post-estancia'
  const esDiaLlegada = fase === 'dia-llegada'
  const esDiaSalida = hoy === ctx.checkOut

  const faseBlock = esPostEstancia
    ? `El huésped ya ha hecho el CHECK-OUT (salió el ${ctx.checkOut}) y ha dejado el apartamento. Si agradece la estancia o se despide, respóndele con calidez agradeciendo que eligió el apartamento. NO menciones horarios de entrada/salida ni información operativa.`
    : fase === 'pre-llegada'
      ? `El huésped AÚN NO HA LLEGADO (llega el ${ctx.checkIn}). Puedes orientarle sobre acceso, hora de entrada o lo que pregunte.`
      : esDiaLlegada
        ? `El huésped LLEGA HOY (${ctx.checkIn}) y puede que AÚN NO HAYA ENTRADO al apartamento. Oriéntale sobre el acceso, la hora de entrada o lo que pregunte; si pregunta por entrar antes de la hora oficial o por dónde dejar el equipaje, ten en cuenta el bloque EARLY CHECK-IN de abajo.`
        : `El huésped ya está dentro del apartamento: NO le repitas la hora de check-in/check-out a menos que lo pregunte expresamente.`

  // Cierre coherente con el momento de la reserva: desearle «buen viaje» a quien sigue en el piso
  // suena a que le estamos despidiendo (lo cazó Alberto en la respuesta a Pilar, 20/08/2026).
  const cierreBlock = bloqueCierre(fase, esDiaSalida)

  // Early check-in: GRATIS, pero SOLO si la noche anterior está libre (regla de Alberto). Aplica en
  // pre-llegada Y EL DÍA DE LLEGADA (en-estancia y post-estancia no tiene sentido). NUNCA se ofrece de pago.
  // Tri-estado: (a) verificado y libre → confirmar; (b) verificado y ocupado → declinar; (c) NO verificado
  // (Smoobu no respondió) → NO afirmar ni negar: decir que lo confirmamos en breve (nunca inventar disponibilidad).
  const entrada = ctx.horaCheckIn || '15:00'
  const earlyBlock = !aplicaEarlyCheckin(fase)
    ? ''
    : !ctx.earlyCheckinChequeado
      ? `EARLY CHECK-IN: ahora mismo NO hemos podido comprobar si la noche anterior está libre. Si el huésped pregunta por entrar antes de las ${entrada} o por dejar el equipaje, NO se lo confirmes NI se lo niegues: dile con amabilidad que lo verificas y se lo confirmas en breve (a más tardar el día antes de la llegada). NUNCA inventes disponibilidad ni des el early check-in por hecho.`
      : ctx.earlyCheckinPosible
        ? esDiaLlegada
          ? `EARLY CHECK-IN: la noche ANTERIOR está LIBRE, así que la entrada anticipada SÍ es posible HOY MISMO, que es su día de llegada. Si el huésped quiere entrar antes de las ${entrada} —o pregunta dónde dejar el equipaje mientras tanto—, puedes confirmarle el early check-in GRATIS (sin coste), sujeto a que el piso esté limpio y listo; pídele su hora estimada de llegada. NUNCA lo ofrezcas como servicio de pago.`
          : `EARLY CHECK-IN: ahora mismo la noche anterior está LIBRE, así que EN PRINCIPIO la entrada anticipada antes de las ${entrada} SÍ va a ser posible. Pero como pueden entrar reservas de última hora antes de su llegada, NO se lo prometas en firme todavía: dile que en principio no hay problema y que se lo confirmáis definitivamente el día antes de su llegada. NUNCA lo ofrezcas como servicio de pago.`
        : `EARLY CHECK-IN: la noche anterior está OCUPADA por otros huéspedes, así que NO es posible entrar antes de las ${entrada} (el piso aún está ocupado y hay que limpiarlo). Explícalo con amabilidad y confirma que la entrada es a partir de las ${entrada}. NUNCA ofrezcas early check-in (ni gratis ni de pago) en este caso.`

  // Late check-out: mismo patrón tri-estado que el early check-in, con el mismo matiz de "firme solo
  // el mismo día del hecho, si no se matiza". A diferencia del early check-in, esto SIEMPRE escala a
  // Alberto (ver esSolicitudLateCheckout más abajo) — el objetivo es que el borrador que le llega ya
  // traiga la respuesta correcta, no automatizar el envío.
  const salida = ctx.horaCheckOut || '11:00'
  const lateBlock = esPostEstancia
    ? ''
    : !ctx.lateCheckoutChequeado
      ? `LATE CHECK-OUT: ahora mismo NO hemos podido comprobar si el piso queda libre el día de la salida. Si el huésped pide salir más tarde de las ${salida}, NO se lo confirmes NI se lo niegues: dile con amabilidad que lo verificas y se lo confirmas en breve. NUNCA inventes disponibilidad.`
      : ctx.lateCheckoutPosible
        ? esDiaSalida
          ? `LATE CHECK-OUT: hoy mismo, que es su día de salida, no entra nadie más al piso, así que SÍ puedes confirmarle que puede salir más tarde de las ${salida} (a la hora que haya pedido, dentro de lo razonable).`
          : `LATE CHECK-OUT: ahora mismo no hay ninguna entrada programada para el día de su salida, así que EN PRINCIPIO SÍ va a ser posible salir más tarde de las ${salida}. Pero como pueden entrar reservas de última hora, NO se lo prometas en firme todavía: dile que en principio no hay problema y que se lo confirmáis definitivamente el mismo día de la salida.`
        : `LATE CHECK-OUT: ese mismo día entra otro huésped al piso, así que NO va a ser posible alargar la salida más allá de las ${salida} (hace falta limpiarlo y prepararlo para la siguiente entrada). Explícaselo con amabilidad y, como alternativa, ofrécele la consigna de equipaje del bloque CONSIGNAS de la ficha para que pueda dejar las maletas y seguir disfrutando de la ciudad hasta la hora que necesite.`

  // Llegada tardía: el huésped anuncia (o pregunta por) una llegada fuera de nuestro horario de
  // atención. NO es un caso de disponibilidad —el acceso es autónomo y no hay hora límite— sino de
  // expectativas: confirmarle que puede llegar a esa hora y avisarle de que a partir de las 21:00 no
  // hay nadie contestando, así que debe llevarse las instrucciones de acceso resueltas. Solo antes de
  // entrar (pre-llegada / día de llegada): en-estancia el huésped ya tiene el acceso resuelto.
  const llegadaBlock = (aplicaEarlyCheckin(fase) && esLlegadaFueraDeHorario(pregunta))
    ? `LLEGADA TARDÍA: el huésped llega fuera de nuestro horario de atención (${HORARIO_ATENCION.desde}–${HORARIO_ATENCION.hasta}). Su llegada NO es ningún problema y así se lo tienes que decir SIN condiciones: la entrada es autónoma y no hay hora límite, entra él solo a la hora que llegue. PROHIBIDO decirle que no se le puede atender a esa hora, pedirle que cambie su viaje o mencionarle un hotel u otro alojamiento. Confírmale la llegada y añade UNA advertencia útil: que como solo respondemos mensajes de ${HORARIO_ATENCION.desde} a ${HORARIO_ATENCION.hasta}, revise y tenga a mano sus instrucciones de acceso antes de las ${HORARIO_ATENCION.hasta} y nos escriba cualquier duda mientras estemos operativos, porque a esas horas no podremos ayudarle.`
    : ''

  // Petición de reseña (28/07/2026, decisión de Alberto): el rating es el freno comercial nº1
  // (Busto 6,9 vs comps 8,3-9,2). SOLO en despedidas/cierres del día de salida o post-estancia
  // — nunca en mitad de la estancia ni en mensajes con carga negativa (needs_human/sentimiento
  // negativo no llegan aquí como cortesía auto-enviable; las guardas comunes del orquestador
  // siguen aplicando). Sin incentivos ni condicionarla a que sea positiva (política de las OTAs).
  const pideResena = (esPostEstancia || esDiaSalida) && (esCierre(pregunta) || esDespedida(pregunta))
  const resenaBlock = pideResena
    ? `\nRESEÑA: el huésped se está despidiendo. Cierra tu respuesta con UNA sola frase amable y nada insistente invitándole a dejar una reseña de su estancia en ${ctx.portal || 'la plataforma donde reservó'} — a un alojamiento pequeño le ayuda muchísimo. No ofrezcas nada a cambio, no pidas que sea positiva y no lo conviertas en un párrafo comercial.`
    : ''

  // Falta más de una semana para la llegada y la guía SÍ tiene instrucciones de acceso, pero aún no
  // toca darlas: la política de Alberto es mandarlas una semana antes, porque se reserva y se cancela.
  // No es un hueco de información — la respuesta correcta es la que ya promete la plantilla de
  // confirmación de Smoobu, así que el agente puede darla sin escalar.
  const accesoBlock = ctx.guiaAccesoOculto
    ? `\nCLAVES DE ACCESO: todavía NO se le pueden dar las instrucciones de entrada, porque faltan más de 7 días para su llegada. Si pregunta por las llaves, por códigos o por cómo entrar, dile con naturalidad que le enviaremos toda la información para recoger las llaves UNA SEMANA ANTES de su llegada. NO te inventes códigos, cajas de llaves ni instrucciones de acceso, y NO le digas que no lo sabes: sí lo sabemos, es que aún no toca.`
    : ''

  const system = `Eres el asistente de atención al huésped de ${ctx.property} (alquiler turístico en ${ctx.zona}).
Huésped: ${ctx.guestName} · llegada ${ctx.checkIn} · salida ${ctx.checkOut} · canal ${ctx.portal}.${horario}
Responde SIEMPRE en ${LANG_NAME[ctx.lang] || 'English'} con un tono cálido, cercano y natural, como una persona real escribiendo a mano (no un folleto ni una plantilla). Saluda al huésped por su nombre.
REGLA DE ORO: responde EXACTAMENTE a lo que el huésped dice y a nada más. NO añadas información que no ha pedido (horarios de entrada/salida, normas, parking, wifi…) salvo que pregunte por ella o sea necesaria para resolver su mensaje. ${faseBlock}
ENTRADA AUTÓNOMA — NUNCA impliques un encuentro en persona: el check-in es AUTOMÁTICO (el huésped accede por su cuenta, sin que nadie le reciba ni le abra) y tú solo escribes mensajes, no vas a estar allí. Por eso NO uses jamás fórmulas de encuentro presencial como «nos vemos», «te espero», «te recibo», «estaré allí/en la puerta», «te abro» ni «hasta ahora/luego» con sentido de vernos, en NINGUNA fase de la reserva. Si el huésped confirma su hora de llegada, acúsale recibo sin sugerir cita: por ejemplo «¡Perfecto! Tomo nota de que llegáis sobre las 18:00» en lugar de «Nos vemos a las 18:00».
NO EJECUTAS ACCIONES: solo escribes mensajes; no gestionas la reserva, no cancelas, no reembolsas, no cambias fechas ni haces cobros. NUNCA afirmes haber hecho o completado una gestión de ese tipo («ya está cancelada», «te he cambiado las fechas», «te he tramitado el reembolso»): no es cierto y no te consta. Si el huésped pide una cancelación, un cambio, un reembolso o cualquier gestión, acúsale recibo con empatía y dile que trasladas su petición al anfitrión, que se encargará y le confirmará — sin darla por hecha ni prometer plazos. Y NO le pidas que te confirme datos de su reserva (fechas, condiciones de cancelación…): ya los tienes en la INFORMACIÓN de abajo, no los verifiques con él.
HILO: tienes los mensajes anteriores de esta conversación como contexto. Continúala con naturalidad teniendo en cuenta lo ya hablado y NO repitas información que ya le hayas dado antes; responde solo al ÚLTIMO mensaje del huésped.
Ajusta la longitud al mensaje: si solo agradece, felicita o hace un comentario breve y positivo, contesta con 1-2 frases cálidas y humanas (sin bloques informativos); si hace una pregunta real, respóndela con el detalle necesario, confirmando lo que pide y ofreciéndote a ayudar en lo que necesite. Evita el relleno y las despedidas largas y genéricas. ${cierreBlock}

INFORMACIÓN DISPONIBLE (única fuente de verdad; NO inventes nada que no esté aquí):
${ctx.ficha || '(sin ficha)'}
${ctx.guia ? `\nGUÍA DEL HUÉSPED:\n${ctx.guia}` : ''}${hechosTxt ? `\nHECHOS DE ESTE PISO (te los ha enseñado el anfitrión — son ciertos y valen tanto como la guía):\n${hechosTxt}` : ''}${accesoBlock}

${aprend ? `EJEMPLOS DE RESPUESTAS APROBADAS POR EL ANFITRIÓN (imítalos en tono y criterio):\n${aprend}\n` : ''}
${earlyBlock}
${lateBlock}
${llegadaBlock}
${resenaBlock}

Escribe ÚNICAMENTE el mensaje que enviarías al huésped, listo para mandar. Nada de comillas, ni JSON, ni notas, ni "Respuesta:" — solo el texto del mensaje.`

  // Hilo de la conversación como contexto (últimos 15, ambos lados) + el turno actual a responder.
  // Sin contrato JSON: el modelo solo tiene que escribir un mensaje, que es lo que hace con fiabilidad.
  const hilo = hiloComoMensajes(ctx.historial, pregunta)

  const mensajes = [...hilo, { role: 'user' as const, content: pregunta }]
  let reply = ''
  try {
    // Por defecto una sola llamada al modelo por defecto de la pasarela (70B), que YA trae su
    // propia cadena de fallback NIM→Groq→Gemini→Kimi. Si hay un modelo "fuerte" configurado en
    // AGENTE_HUESPED_MODEL, se intenta ese primero y, si falla, se reintenta con el 70B por
    // defecto (el modelo fuerte es ADITIVO: nunca debe dejarnos sin respuesta).
    let raw = ''
    if (MODELO_HUESPED) {
      try {
        raw = await aiComplete(mensajes, { system, maxTokens: 500, model: MODELO_HUESPED, timeoutMs: HUESPED_TIMEOUT_MS })
      } catch (e1: any) {
        console.error('[decidir] modelo fuerte falló, reintento con default:', e1?.message)
        raw = await aiComplete(mensajes, { system, maxTokens: 500, timeoutMs: HUESPED_TIMEOUT_MS })
      }
    } else {
      raw = await aiComplete(mensajes, { system, maxTokens: 500, timeoutMs: HUESPED_TIMEOUT_MS })
    }
    reply = limpiarReply(raw || '')
  } catch (e: any) {
    console.error('[decidir] aiComplete error:', e?.message)
    return { reply: '', confidence: 0, needs_human: true, categoria, sentimiento: 'neutro', motivo: 'IA no disponible', fuente: 'ia' }
  }

  if (!reply) {
    return { reply: '', confidence: 0, needs_human: true, categoria, sentimiento: 'neutro', motivo: 'IA sin respuesta', fuente: 'ia' }
  }

  // Red determinista sobre la DESPEDIDA: si el borrador cierra con una fórmula de viaje o de adiós
  // que no toca en esta fase, se poda cuando va aislada en su frase; si va entretejida con contenido
  // real, no se reescribe y el mensaje pasa por Alberto en vez de auto-enviarse.
  const revision = revisarCierre(reply, fase, esDiaSalida)
  reply = revision.texto
  const cierreFueraDeFase = revision.incoherente

  // Decisión de escalado / metadatos, derivada de REGLAS + clasificador de una palabra (no de un JSON).
  const sentimiento = sentimientoDe(pregunta)
  const sensible = esSensible(pregunta)
  const inventado = contieneDatoInventado(reply, fuentes)
  // Si ya hay motivo firme para escalar, no gastamos la llamada al clasificador.
  const veredicto: Veredicto = (sensible || sentimiento === 'negativo' || inventado)
    ? 'ESCALAR'
    : await debeEscalar(ctx, pregunta, reply)
  const escalaIA = veredicto === 'ESCALAR'
  const sinVerificar = veredicto === 'DESCONOCIDO'
  // Late check-out SIEMPRE escala, pase lo que pase con el clasificador de calidad — si el borrador
  // ahora responde bien, `escalaIA` dejaría de marcarlo, y Alberto pidió que siguiera pasando por él.
  const lateCheckout = esSolicitudLateCheckout(pregunta)

  const needs_human = sensible || sentimiento === 'negativo' || inventado || escalaIA || lateCheckout || sinVerificar || cierreFueraDeFase

  // ¿Se apoya en una fuente real? Es la condición del auto-envío (regla del 20/08/2026). Exige que la
  // guía se haya PODIDO LEER: con `guiaCargada=false` no sabemos si la respuesta está respaldada o
  // si el agente está rellenando huecos de memoria, y ante esa duda no se manda nada solo.
  const apoyada_en_fuente = !needs_human && ctx.guiaCargada && !!reply
  // Un cierre de conversación (gracias/ok…) por defecto no requiere respuesta; cualquier otra cosa sí.
  // Si escalamos, SIEMPRE requiere respuesta (no se descarta a la ligera).
  const requiere_respuesta = needs_human ? true : !esCierre(pregunta)
  // Cortesía de fin de estancia (cierre puro O despedida/agradecimiento): habilita el auto-envío de la
  // respuesta cálida sin depender del contador de graduación. Solo surte efecto si además pasa las
  // guardas en el orquestador (needs_human=false), así que un mensaje sensible/negativo nunca cuela.
  const es_cortesia = esCierre(pregunta) || esDespedida(pregunta)

  const motivo = inventado
    ? 'guardrail: dato no presente en las fuentes'
    : sensible
      ? 'mensaje sensible (queja/dinero/cambios/emergencia)'
      : sentimiento === 'negativo'
        ? 'sentimiento negativo'
        : escalaIA
          ? 'la respuesta no cubre bien la pregunta — quizá falta en la guía del piso'
          : sinVerificar
            ? 'no se pudo verificar el borrador (control de calidad caído) — lo reviso yo'
          : lateCheckout
            ? 'late check-out: requiere confirmación del anfitrión'
            : cierreFueraDeFase
              ? 'la despedida no encaja con el momento de la reserva (habla de viaje/adiós y el huésped sigue alojado)'
            : ''

  return {
    reply,
    confidence: needs_human ? 0.3 : 0.9,
    needs_human,
    requiere_respuesta,
    es_cortesia,
    apoyada_en_fuente,
    categoria,
    sentimiento,
    motivo,
    fuente: 'ia',
  }
}
