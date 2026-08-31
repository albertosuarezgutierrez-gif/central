// lib/correo/agoda-mensajes.ts — parser PURO del aviso «New messages from your guests» de Agoda.
//
// POR QUÉ EXISTE (medido el 31/08/2026 contra Smoobu, 8 reservas de Agoda del histórico):
// el canal de Agoda es de UNA SOLA DIRECCIÓN. Smoobu ENTREGA nuestros mensajes al huésped por el
// alias `…@agoda-messaging.com` (los 7 automáticos salieron en todas), pero lo que el huésped
// contesta NO vuelve: en las 8 reservas hay CERO mensajes de huésped. Y no es que no escribieran —
// de `atul bhatt` (abril 2026) hay prueba independiente: este mismo correo de Agoda recoge su
// mensaje del 14/04 a las 16:17, y el hilo de Smoobu de esa reserva termina esa misma mañana.
// (Control: el hilo de Booking de la reserva viva de House tiene 16 mensajes, 6 del huésped.)
//
// O sea: al huésped de Agoda se le puede hablar, pero su respuesta vive SOLO en el extranet YCS.
// Este correo es la única señal que llega al buzón — de ahí que el triaje lo cace.
//
// 🚨 DOS COSAS QUE NO SON OBVIAS:
//  1. **NO se enruta al agente de huéspedes de SIVRA.** Ese agente contesta en el hilo de Smoobu, y
//     para Agoda el hilo es un buzón sin salida hacia el huésped: la respuesta no llegaría y
//     quedaría constancia de haber contestado. Se responde por YCS, y por eso el aviso lleva el enlace.
//  2. Es un **digest DIARIO** de Agoda (su propia URL lo llama `PropertyDailyDigest`), así que el
//     aviso puede llegar hasta un día tarde. No se promete inmediatez que la fuente no da.
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

/** ¿Es este correo el aviso de mensajes de huésped de Agoda? Exige remitente Agoda + su asunto. */
export function esAvisoMensajesAgoda(correo: { from: string; subject: string }): boolean {
  if (!/@agoda\.com/i.test(correo.from || '')) return false
  const s = correo.subject || ''
  return /new messages from your guests|mensajes nuevos de sus hu[eé]spedes/i.test(s)
}

/** Extrae lo aprovechable del aviso. Devuelve null si el correo no es de este tipo. */
export function parsearAvisoMensajesAgoda(
  correo: { from: string; subject: string; body: string },
): AvisoMensajesAgoda | null {
  if (!esAvisoMensajesAgoda(correo)) return null
  const cuerpo = correo.body || ''

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
  }
}

/** Texto del aviso de Telegram. Dice qué se sabe, qué no, y POR DÓNDE se contesta. */
export function textoAvisoAgoda(a: AvisoMensajesAgoda, nombrePiso?: string): string {
  const quien = a.huesped ? `<b>${a.huesped}</b>` : 'un huésped'
  const donde = nombrePiso || a.propertyId || (a.propertyIdAgoda ? `alojamiento ${a.propertyIdAgoda}` : 'piso sin identificar')
  const partes = [`📩 <b>Agoda</b> · ${donde}: ${quien} ha escrito.`]
  if (a.mensaje) partes.push(`\n«${a.mensaje}»`)
  else partes.push('\n(El aviso no traía el texto del mensaje.)')
  partes.push('\n🚨 Agoda NO devuelve las respuestas del huésped a Smoobu: esto NO se contesta desde el hilo, hay que hacerlo en YCS.')
  // Si el enlace exacto se perdió con el truncado del extracto, se da la puerta de YCS igual: el
  // aviso tiene que terminar SIEMPRE en un sitio al que ir, no en «míralo en algún sitio».
  partes.push(`👉 ${a.urlYcs ?? 'https://ycs.agoda.com/'}`)
  partes.push('⏱️ Es el resumen DIARIO de Agoda: el mensaje puede llevar hasta un día esperando.')
  return partes.join('\n')
}
