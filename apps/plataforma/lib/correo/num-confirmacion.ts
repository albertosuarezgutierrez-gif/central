// lib/correo/num-confirmacion.ts — de qué correos se puede sacar un nº de reserva, y cuál.
//
// POR QUÉ EXISTE (04/09/2026). El vigía Booking↔Smoobu mandó un 🚨 «Reserva que Smoobu NO tiene ·
// reserva 360009410197 · canal no identificado en el correo». No existe tal reserva: el correo era
// de **HomeExchange** (`notifications@info.homeexchange.com`, «Irene et Rico ha contestado a tu
// mensaje» — un intercambio de casa que además se caía porque les subieron los vuelos), y el
// número salía de la URL de un artículo de su Zendesk:
//
//     https://help.homeexchange.com/hc/es/articles/360009410197--Como-puedo-reportar-...
//
// O sea, las mismas DOS grietas que ya se taparon el 01/09 para los correos del propio Smoobu,
// abiertas de nuevo por otro remitente:
//   1. El colador de nº era `\b(\d{9,})\b` sobre asunto+cuerpo, y **el cuerpo lleva URLs**. Un id
//      de artículo, de campaña o de perfil dentro de un enlace tiene exactamente la misma forma
//      que una referencia de OTA. Aquí se quitan las URLs ANTES de mirar.
//   2. HomeExchange no es un canal de reservas: por ahí no entra ninguna estancia a Smoobu, así
//      que un número suyo jamás puede estar «desaparecido». El leg B del vigía solo debe mirar
//      correos de un canal por el que REALMENTE entran reservas.
//
// Puro (sin `@/` ni prisma) → testeable con `node --test` (num-confirmacion.test.ts).

/**
 * Dominios por los que ENTRAN reservas al calendario (OTAs + el propio PMS). Un correo de
 * cualquier otro remitente puede traer números de 9+ cifras a montones —newsletters, bancos,
 * plataformas de intercambio— y ninguno es una reserva que a Smoobu le falte.
 *
 * Ampliar esta lista es el precio de dar de alta un canal nuevo. El fallo por quedarse corto es
 * VISIBLE (un huésped escribe y no se enruta ni se vigila); el de quedarse largo es un 🚨 falso,
 * que es justo lo que este módulo existe para evitar.
 */
const DOMINIOS_CANAL = [
  'booking.com',        // guest.booking.com, mailrouter-*.prod.booking.com, admin.booking.com
  'expedia.com', 'expediapartnercentral.com', 'expediamail.com',
  'agoda.com', 'agoda.net',
  'airbnb.com',
  'vrbo.com', 'homeaway.com',
  'hostelworld.com',
  'smoobu.com',
]

/** ¿El correo viene de un canal por el que entran reservas? (cubre subdominios) */
export function esRemitenteDeCanal(from: string): boolean {
  const dom = (from || '').toLowerCase().trim().replace(/^.*</, '').replace(/>.*$/, '').split('@')[1]?.trim() ?? ''
  if (!dom) return false
  return DOMINIOS_CANAL.some(d => dom === d || dom.endsWith(`.${d}`))
}

/** Quita las URLs del texto: los dígitos de dentro de un enlace no son una referencia. */
function sinUrls(texto: string): string {
  return texto.replace(/https?:\/\/\S+/gi, ' ').replace(/\bwww\.\S+/gi, ' ')
}

/**
 * Nº de confirmación de la OTA tal cual lo publica el correo, o null si no lo dice.
 * Booking lo pone en claro («Número de confirmación: 5815945265»); el resto de canales caen al
 * primer número largo suelto — pero SIEMPRE sobre el texto sin enlaces.
 */
export function extraerNumConfirmacionDe(subject: string, cuerpo: string): string | null {
  const texto = sinUrls(`${subject}\n${cuerpo}`)
  const m = texto.match(/confirmaci[oó]n[:\s#]*([0-9]{6,})/i) || texto.match(/\b(\d{9,})\b/)
  return m ? m[1] : null
}
