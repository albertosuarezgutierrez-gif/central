// Cortesía pura — el par (mensaje del huésped, borrador) que no contiene NADA que verificar.
//
// Por qué existe como módulo aparte (04/09/2026, dictado por Alberto sobre la reserva 152961026 de
// Esther): «Muchísimas gracias, un saludo» se propuso para revisión en vez de salir solo, y por DOS
// motivos independientes, no uno:
//   1. El detector de cierre no lo reconocía. `RE_CIERRE` solo admitía «muchas» (no «muchísimas») y
//      nada detrás de la fórmula, así que la coletilla «, un saludo» —la forma normal de despedirse
//      en español— tumbaba la detección. Sin `es_cortesia` no se intenta siquiera la vía de cortesía.
//   2. El control de calidad estaba caído (veredicto `DESCONOCIDO`) y eso entra en `needs_human`,
//      que es guarda COMÚN: aunque el detector hubiera acertado, tampoco habría salido.
// Arreglar solo uno de los dos no habría cambiado nada en este caso. Se arreglan los dos.
//
// La relajación del punto 2 es ESTRECHA a propósito y no contradice la regla del repo («dato que no
// hay ≠ dato que no se ha mirado»): el control de calidad juzga *si el borrador resuelve lo que pide
// el huésped con datos de la INFORMACIÓN*. Cuando el huésped no pide nada y el borrador no afirma
// nada, ese veredicto no aporta información — su ausencia no es una pérdida. Por eso hacen falta las
// DOS mitades: mensaje íntegramente de cortesía Y respuesta sin ningún dato comprobable. Cualquier
// cifra, hora, enlace o importe en el borrador lo devuelve a la vía normal (revisión de Alberto).
// Y cuando sale por aquí con el control caído, el aviso de Telegram lo DECLARA (`sin_verificar`):
// si no, un control de calidad muerto durante días dejaría de notarse justo en los mensajes que
// dejan de pasar por Alberto.

// Separadores/relleno admitidos entre fórmulas: espacios, puntuación suave y emoji.
const SEP = '[\\s!¡.,;:…\\-–—\\p{Extended_Pictographic}\\uFE0F\\u200D]'

// Intensificadores del agradecimiento («muchísimas gracias», «mil gracias», «thank you so much»).
const INTENS = '(?:mu(?:ch[íi]sim|ch)[ao]s?|mil|tantas|un mill[óo]n de|very|so|thank you)\\s+'

// Núcleo: la fórmula de cortesía en sí.
const NUCLEO = [
  'gracias+', 'te lo agradezco', 'lo agradezco', 'agradecid[oa]s?',
  'ok+', 'okey', 'vale', 'perfecto', 'genial', 'estupendo', 'fenomenal', 'excelente',
  'de acuerdo', 'entendido', 'recibido', 'anotado', 'correcto', 'muy amable', 'sois muy amables',
  // Las formas largas van ANTES que `thanks?`: la alternancia se prueba en orden y, si gana la
  // corta, el resto («so much») queda suelto y el ancla final falla.
  'thank you so much', 'thank you very much', 'thanks so much', 'thanks very much', 'thanks a lot',
  'thank you', 'thanks?', 'thx', 'great', 'perfect', 'awesome', 'got it', 'noted', 'understood',
  'merci', 'parfait', "d'accord", 'grazie', 'perfetto', 'va bene', 'danke', 'vielen dank', 'alles klar',
].join('|')

// Coletilla de despedida que suele acompañar («…, un saludo», «…, best regards»). Dentro de un
// mensaje ANCLADO que solo contiene fórmulas, cuenta como parte del cierre.
const COLA = [
  'un saludo', 'saludos', 'un abrazo', 'abrazos', 'un cordial saludo', 'atentamente', 'cordialmente',
  'hasta luego', 'hasta pronto', 'hasta ma[ñn]ana', 'nos vemos',
  'buenas noches', 'buenas tardes', 'buenos d[íi]as', 'buen d[íi]a', 'feliz d[íi]a', 'feliz estancia',
  'best regards', 'kind regards', 'regards', 'cheers', 'bye', 'goodbye', 'see you', 'take care',
  'bien cordialement', 'cordialement', 'bonne journ[ée]e', '[àa] bient[ôo]t',
  'cordiali saluti', 'a presto', 'buona giornata',
  'liebe gr[üu][ßs]e', 'viele gr[üu][ßs]e', 'sch[öo]nen tag',
].join('|')

const TERMINO = `(?:(?:${INTENS})?(?:${NUCLEO})|(?:${COLA}))`
const RE_CIERRE = new RegExp(`^${SEP}*${TERMINO}(?:${SEP}+${TERMINO})*${SEP}*$`, 'iu')

/**
 * ¿El mensaje del huésped es ÍNTEGRAMENTE una o varias fórmulas de cortesía?
 * Anclado a propósito: si trae cualquier contenido real (una pregunta, un dato, una queja) → false.
 */
export function esCierre(text: string): boolean {
  return RE_CIERRE.test((text || '').trim())
}

// Cualquier cosa del borrador que un humano tendría que comprobar: cifras (horas, códigos, precios,
// teléfonos), enlaces, correos, símbolos de moneda y las palabras que anuncian una credencial. Si
// aparece una sola, el borrador YA no es una fórmula vacía y el control de calidad vuelve a tener
// algo que decir sobre él.
const RE_DATO = /[0-9]|https?:\/\/|www\.|@|[€$£]|\b(?:wifi|password|contrase|c[óo]digo|code|iban|bizum)/i

/**
 * ¿El borrador es una respuesta cálida SIN ningún dato comprobable?
 * Segunda mitad de la guarda: un mensaje de cortesía puede provocar igualmente un borrador que
 * suelte una hora o un código, y eso sí hay que verificarlo.
 */
export function respuestaSinDatos(reply: string): boolean {
  const t = (reply || '').trim()
  return t.length > 0 && !RE_DATO.test(t)
}

/**
 * Par cortesía↔cortesía: ni la pregunta pide nada, ni la respuesta afirma nada.
 * Único caso en el que un control de calidad caído NO bloquea el auto-envío.
 */
export function esIntercambioDeCortesia(pregunta: string, reply: string): boolean {
  return esCierre(pregunta) && respuestaSinDatos(reply)
}
