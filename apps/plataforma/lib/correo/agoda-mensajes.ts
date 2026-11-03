// lib/correo/agoda-mensajes.ts — parser PURO de los avisos de mensaje de huésped de Agoda.
//
// DOS FORMATOS (los dos se reconocen):
//  A. DIGEST antiguo (`…@agoda.com`, «New messages from your guests»): una dirección, sin respuesta
//     posible por correo; el huésped se contesta en el extranet YCS. (Medido 31/08/2026: Smoobu entrega
//     nuestros mensajes por el alias `…@agoda-messaging.com` pero lo que el huésped contesta no vuelve.)
//  B. CORREO INDIVIDUAL (visto 03/11/2026, `notifications@agoda-messaging.com`, asunto «Reply from
//     <huésped> (Nov 3-5, 2026)»): UN correo por mensaje, y RESPONDER a ese correo llega al huésped.
//     Por eso este formato entra al agente de huéspedes y la respuesta sale como respuesta al correo
//     (`agoda-hilo.ts`), no por Smoobu.
//
// Es un digest DIARIO solo en el formato A; en B el aviso es inmediato.
//
// El fixture del test se copia del correo REAL (regla del repo), incluidos sus caracteres raros:
// el HTML de Agoda mete bytes de control en los enlaces de tracking.

export interface AvisoMensajesAgoda {
  /** Cuántos mensajes sin leer declara el correo. null = no lo publicó legible. */
  sinLeer: number | null
  /** Nombre del huésped que escribió (el que Agoda destaca). null = no legible. */
  huesped: string | null
  /** Texto del mensaje, que Agoda SÍ incluye en el aviso. null = no venía. */
  mensaje: string | null
  /** Property ID de Agoda tal cual (p. ej. '12791421'). null = no legible. */
  propertyIdAgoda: string | null
  /** slug prop_* si el property ID es uno conocido; null = no mapeado (NO se adivina). */
  propertyId: string | null
  /** Enlace al buzón de YCS donde SÍ se puede contestar. null = no legible. */
  urlYcs: string | null
  /** 'individual' = correo por mensaje, se contesta respondiendo al correo. 'digest' = solo YCS. */
  formato: 'digest' | 'individual'
  /** ¿Se puede contestar respondiendo al propio correo? (solo el formato individual) */
  respondePorCorreo: boolean
  /** ID de reserva de Agoda («ID de reserva: 1053955690»). null = no legible. */
  reservaAgoda: string | null
  /** Nombre del piso tal como lo llama Agoda en el saludo («Hola Luxury,» → 'Luxury'). */
  nombrePisoAgoda: string | null
  /** Fechas de la estancia del asunto «(Nov 3-5, 2026)», ISO. null = no legibles. */
  llegada: string | null
  salida: string | null
}

// Property IDs de Agoda vistos en correos REALES del buzón. Solo se mapea lo confirmado:
// un id desconocido devuelve null (mejor «piso sin identificar» que atribuirlo al equivocado).
//  · 12791421 → «Luxury (Property ID 12791421)» (voucher del 31/08/2026)
//  · 12780408 → «House Sevillana (Hotel ID: 12780408)» (correo de cuenta bancaria del 01/05/2026)
const PISO_POR_ID_AGODA: Record<string, string> = {
  '12791421': 'prop_luxury_busto',
  '12780408': 'prop_house_sevillana',
}

const RE_SIN_LEER = /(\d+)\s*mensajes?\s*no\s*le[ií]dos?/i
// La cabecera de la tabla: «| atul bhatt | Apr 14, 04:17 PM |»
const RE_FILA_HUESPED = /\|\s*([^|\n]{2,60}?)\s*\|\s*([A-Z][a-z]{2}\s+\d{1,2},\s*\d{1,2}:\d{2}\s*[AP]M)\s*\|/
// El enlace de «Responder a través de YCS» lleva el id del alojamiento en la ruta del inbox.
const RE_YCS_ID = /hermes(?:%2F|\/)inbox(?:%2F|\/)ycs(?:%2F|\/)(\d{6,})/i
const RE_URL_YCS = /(https?:\/\/[^\s)|]*ycs\.agoda\.com[^\s)|]*)/i

// Remitente del correo individual: el dominio EXACTO (o subdominio) de mensajería de Agoda. El `from`
// del triaje es la dirección en minúsculas; el nombre visible (= el huésped) no cuenta para nada.
const RE_FROM_MENSAJERIA = /@(?:[\w-]+\.)*agoda-messaging\.com\s*>?\s*$/i
// «Reply from X (…)», «New message from X», «Mensaje de X», «Respuesta de X», «Nuevo mensaje de X».
const RE_ASUNTO_INDIVIDUAL = /^\s*(?:re:\s*)?(?:reply from|new message from|message from|nuevo mensaje de|mensaje nuevo de|mensaje de|respuesta de)\s+(.+?)\s*(?:\([^)]*\))?\s*$/i

/** Correo individual (formato B): remitente de mensajería + asunto de mensaje de huésped. */
export function esMensajeIndividualAgoda(correo: { from: string; subject: string }): boolean {
  return RE_FROM_MENSAJERIA.test((correo.from || '').trim()) && RE_ASUNTO_INDIVIDUAL.test(correo.subject || '')
}

/** ¿Es este correo un aviso de mensaje de huésped de Agoda (digest antiguo o correo individual)? */
export function esAvisoMensajesAgoda(correo: { from: string; subject: string }): boolean {
  if (esMensajeIndividualAgoda(correo)) return true
  if (!/@agoda\.com/i.test(correo.from || '')) return false
  const s = correo.subject || ''
  return /new messages from your guests|mensajes nuevos de sus hu[eé]spedes/i.test(s)
}

const MESES: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** «(Nov 3-5, 2026)», «(Nov 30-Dec 2, 2026)», «(Dec 30, 2026-Jan 2, 2027)» → fechas ISO. PURO. */
export function fechasDeAsunto(asunto: string): { llegada: string; salida: string } | null {
  const mes = (t: string) => MESES[t.slice(0, 3).toLowerCase()]
  const m1 = asunto.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–]\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})\s*,\s*(\d{4})\s*\)/)
  if (m1) {
    const a = mes(m1[1]); const b = m1[3] ? mes(m1[3]) : a
    if (!a || !b) return null
    const y = Number(m1[5])
    return { llegada: iso(y, a, Number(m1[2])), salida: iso(y, b, Number(m1[4])) }
  }
  const m2 = asunto.match(/\(\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,\s*(\d{4})\s*[-–]\s*([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,\s*(\d{4})\s*\)/)
  if (m2) {
    const a = mes(m2[1]); const b = mes(m2[4])
    if (!a || !b) return null
    return { llegada: iso(Number(m2[3]), a, Number(m2[2])), salida: iso(Number(m2[6]), b, Number(m2[5])) }
  }
  return null
}

/** Piso (nombre que usa Agoda en el saludo) → slug prop_*. Solo lo confirmado; lo demás, null. */
export function propiedadPorNombreAgoda(nombre: string | null): string | null {
  const n = (nombre || '').toLowerCase()
  if (!n) return null
  if (n.includes('luxury')) return 'prop_luxury_busto'
  if (n.includes('house') || n.includes('sevillana')) return 'prop_house_sevillana'
  return null
}

// Marcadores que separan la traducción automática del texto ORIGINAL del huésped.
const RE_MARCA_ORIGINAL = /(?:del siguiente mensaje original|of the following original message|del mensaje original|of the original message)\s*:/i
// Donde acaba el mensaje nuevo y empieza el pie / el historial.
const RE_FIN_MENSAJE = /Did you know\?|Sab[ií]as que|Replying to this email|Responder a este correo|Simplemente responde|Just reply to this email|Reply to this email/i

/** Quita el marco de tabla `| … |` y junta las líneas. */
function sinTabla(t: string): string {
  return t.split('\n').map((l) => l.replace(/^[\s|]+/, '').replace(/[\s|]+$/, '')).filter(Boolean).join('\n')
}

/**
 * Del cuerpo del correo individual saca el mensaje NUEVO del huésped: lo que va tras «ID de reserva» y
 * antes de «Replying to this email». Si trae traducción automática se queda con el ORIGINAL (es lo que
 * escribió; el agente detecta su idioma). El historial (después del pie) se descarta. PURO.
 */
export function mensajeNuevoIndividual(cuerpo: string): string | null {
  const limpio = sinTabla(cuerpo.replace(/\r/g, ''))
  const ini = limpio.search(/ID de reserva\s*:|Booking ID\s*:|Reservation ID\s*:|Reserva\s*ID\s*:/i)
  if (ini < 0) return null
  const tras = limpio.slice(ini).replace(/^[^\n]*\n?/, '')   // salta la propia línea del ID
  const fin = tras.search(RE_FIN_MENSAJE)
  let bloque = (fin >= 0 ? tras.slice(0, fin) : tras)
  const marca = bloque.match(RE_MARCA_ORIGINAL)
  if (marca && marca.index !== undefined) bloque = bloque.slice(marca.index + marca[0].length)
  const texto = bloque.replace(/\s+/g, ' ').trim()
  return texto || null
}

/** Extrae lo aprovechable del aviso. Devuelve null si el correo no es de este tipo. */
export function parsearAvisoMensajesAgoda(
  correo: { from: string; subject: string; body: string },
): AvisoMensajesAgoda | null {
  if (!esAvisoMensajesAgoda(correo)) return null
  const cuerpo = correo.body || ''
  if (esMensajeIndividualAgoda(correo)) return parsearIndividual(correo, cuerpo)

  const mSinLeer = cuerpo.match(RE_SIN_LEER)
  const mFila = cuerpo.match(RE_FILA_HUESPED)
  const huesped = mFila ? mFila[1].trim() : null

  // El mensaje del huésped va SUELTO entre la fila de su nombre y el bloque «Responder…».
  let mensaje: string | null = null
  if (mFila) {
    const desde = cuerpo.indexOf(mFila[0]) + mFila[0].length
    const corte = cuerpo.slice(desde).search(/\|\s*Responder|\|\s*Reply/i)
    const bruto = (corte >= 0 ? cuerpo.slice(desde, desde + corte) : cuerpo.slice(desde))
      .replace(/\s+/g, ' ')
      .trim()
    mensaje = bruto || null
  }

  const idAgoda = cuerpo.match(RE_YCS_ID)?.[1] ?? null
  return {
    sinLeer: mSinLeer ? Number(mSinLeer[1]) : null,
    huesped,
    mensaje,
    propertyIdAgoda: idAgoda,
    propertyId: idAgoda ? (PISO_POR_ID_AGODA[idAgoda] ?? null) : null,
    urlYcs: cuerpo.match(RE_URL_YCS)?.[0] ?? null,
    formato: 'digest',
    respondePorCorreo: false,
    reservaAgoda: null, nombrePisoAgoda: null, llegada: null, salida: null,
  }
}

function parsearIndividual(correo: { subject: string }, cuerpo: string): AvisoMensajesAgoda {
  const huesped = correo.subject.match(RE_ASUNTO_INDIVIDUAL)?.[1]?.trim() ?? null
  const plano = sinTabla(cuerpo)
  const nombrePiso = plano.match(/(?:^|\n|\|)\s*(?:Hola|Hello|Hi|Dear)\s+([^,|\n]{1,80}),/i)?.[1]?.trim() ?? null
  const reserva = plano.match(/(?:ID de reserva|Booking ID|Reservation ID)\s*:\s*(\d{6,})/i)?.[1] ?? null
  const f = fechasDeAsunto(correo.subject)
  return {
    sinLeer: 1,
    huesped,
    mensaje: mensajeNuevoIndividual(cuerpo),
    propertyIdAgoda: null,
    propertyId: propiedadPorNombreAgoda(nombrePiso),
    urlYcs: cuerpo.match(RE_URL_YCS)?.[0] ?? null,
    formato: 'individual',
    respondePorCorreo: true,
    reservaAgoda: reserva,
    nombrePisoAgoda: nombrePiso,
    llegada: f?.llegada ?? null,
    salida: f?.salida ?? null,
  }
}

/** Texto del aviso de Telegram del DIGEST (formato A). Dice qué se sabe, qué no, y POR DÓNDE se contesta. */
export function textoAvisoAgoda(a: AvisoMensajesAgoda, nombrePiso?: string): string {
  const quien = a.huesped ? `<b>${a.huesped}</b>` : 'un huésped'
  const donde = nombrePiso || a.propertyId || (a.propertyIdAgoda ? `alojamiento ${a.propertyIdAgoda}` : 'piso sin identificar')
  const partes = [`📩 <b>Agoda</b> · ${donde}: ${quien} ha escrito.`]
  if (a.mensaje) partes.push(`\n«${a.mensaje}»`)
  else partes.push('\n(El aviso no traía el texto del mensaje.)')
  partes.push('\n🚨 Agoda NO devuelve las respuestas del huésped a Smoobu y este resumen diario no admite respuesta por correo: hay que contestar en YCS.')
  // Si el enlace exacto se perdió con el truncado del extracto, se da la puerta de YCS igual: el
  // aviso tiene que terminar SIEMPRE en un sitio al que ir, no en «míralo en algún sitio».
  partes.push(`👉 ${a.urlYcs ?? 'https://ycs.agoda.com/'}`)
  partes.push('⏱️ Es el resumen DIARIO de Agoda: el mensaje puede llevar hasta un día esperando.')
  return partes.join('\n')
}
