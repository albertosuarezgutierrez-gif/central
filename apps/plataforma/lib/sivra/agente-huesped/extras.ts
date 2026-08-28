// lib/sivra/agente-huesped/extras.ts — detección PURA de extras de pago y del «sí» del huésped.
//
// Este módulo no habla con la BD ni con Stripe a propósito: es la parte que decide, y las
// decisiones sobre dinero tienen que poder testearse sin levantar nada.
//
// 🚨 EL IMPORTE NO LO DICE NUNCA LA IA. Hasta el 28/08/2026 los 20€ de la cuna vivían sueltos
// en la guía del piso o en `mensajes_hechos`, es decir, en texto libre que lee un LLM: nada
// impedía que la guía dijera un precio y se cobrara otro, ni que el modelo se inventara una
// cifra intermedia. El precio sale del catálogo (`sivra_extras_catalogo`) y `importeSospechoso`
// caza cualquier cifra en euros del borrador que no cuadre con él.

/** Códigos del catálogo que este módulo sabe detectar en el texto del huésped. */
export type CodigoExtra = 'cuna_trona'

// Cuna y trona van juntas en el catálogo, así que basta con que el huésped nombre CUALQUIERA
// de las dos. Cinco idiomas, los mismos que soporta el agente.
//   ES cuna, trona · EN cot, crib, high chair · FR lit bébé, berceau, chaise haute
//   DE Kinderbett, Babybett, Hochstuhl · IT culla, lettino, seggiolone
//
// 🚨 Las fronteras son Unicode (`(?<![\p{L}\p{N}])`), NO `\b`. Con `\b` el patrón fallaba en
// «lit bébé» y en «sí»: para `\b` una vocal acentuada NO es carácter de palabra, así que un
// término acabado en `é`/`í` seguido de espacio no cierra frontera y no casaba nunca. Lo cazaron
// los tests de este módulo; sin ellos el agente habría ignorado en silencio a los huéspedes
// franceses e italianos.
const LIM_IZQ = '(?<![\\p{L}\\p{N}])'
const LIM_DER = '(?![\\p{L}\\p{N}])'
const rodear = (alternativas: string) => new RegExp(`${LIM_IZQ}(?:${alternativas})${LIM_DER}`, 'iu')

const RE_CUNA_TRONA = rodear('cuna|trona|cot|crib|high\\s*chair|highchair|lit\\s*b[ée]b[ée]|berceau|chaise\\s*haute|kinderbett|babybett|reisebett|hochstuhl|culla|lettino|seggiolone')

/**
 * ¿El huésped está hablando de un extra del catálogo? Devuelve su código o null.
 * Solo mira el texto: quién lo ofrece y a qué precio es cosa del catálogo.
 */
export function detectarExtra(texto: string): CodigoExtra | null {
  if (RE_CUNA_TRONA.test(texto || '')) return 'cuna_trona'
  return null
}

// Una negación en cualquiera de los cinco idiomas. Va PRIMERO que la aceptación porque
// «no, gracias» contiene «gracias», y «gracias» es una de las señales de conformidad.
const RE_NEGACION = rodear("no|nope|nada|ning[úu]n|sin|non|nein|never\\s*mind|forget\\s*it|d[ée]j[ae]lo|olv[íi]dalo")

// Conformidad EXPLÍCITA. Deliberadamente corta: lo que no esté aquí va a Telegram.
const RE_ACEPTACION = rodear("s[íìi]|vale|ok|okay|okey|de\\s*acuerdo|perfecto|genial|estupendo|adelante|me\\s*viene\\s*bien|l[ao]\\s*quiero|l[ao]s?\\s*queremos|yes|yeah|sure|please\\s*do|sounds\\s*good|go\\s*ahead|we'?ll\\s*take\\s*it|oui|d'?accord|parfait|volontiers|ja|gerne|einverstanden|passt|va\\s*bene|perfetto|d'?accordo|volentieri")

// Una PREGUNTA no es una aceptación, aunque lleve un «sí» dentro («sí, ¿y cuánto cuesta?»).
// El interrogante manda: si el huésped todavía pregunta, el trato no está cerrado.
const RE_PREGUNTA = /[?¿]/

/**
 * ¿El huésped está aceptando el extra que ya se le ofreció con un precio?
 *
 * Conservador a propósito: ante la duda devuelve `false` y el mensaje acaba en Telegram, que
 * es donde debe acabar cualquier cosa que no sea un «sí» limpio. Regatear, pedir dos cunas o
 * preguntar si se puede pagar en efectivo NO son aceptaciones.
 */
export function esAceptacion(texto: string): boolean {
  const t = (texto || '').trim()
  if (!t) return false
  if (RE_PREGUNTA.test(t)) return false
  if (RE_NEGACION.test(t)) return false
  return RE_ACEPTACION.test(t)
}

/** Importe en euros formateado a la española (2.162,49€). Mismo criterio que `lib/dinero.ts`. */
export function eurDeCents(cents: number): string {
  return `${(cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€`
}

// Cifras con pinta de importe en euros dentro de un texto: «20€», «20 EUR», «€20», «20,00 euros».
const RE_IMPORTE = /(?:€\s*(\d{1,3}(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b))/gi

/**
 * ¿El borrador menciona algún importe que NO esté en el catálogo?
 *
 * Es el guardrail que impide que una cifra inventada por el modelo llegue al huésped. Devuelve
 * el primer importe descuadrado (en céntimos) o null si todos los que aparecen son legítimos.
 * Un texto sin cifras devuelve null: no mencionar precio no es un fallo.
 */
export function importeSospechoso(borrador: string, permitidosCents: number[]): number | null {
  const permitidos = new Set(permitidosCents)
  for (const m of (borrador || '').matchAll(RE_IMPORTE)) {
    const crudo = (m[1] ?? m[2] ?? '').replace(',', '.')
    const cents = Math.round(Number(crudo) * 100)
    if (!Number.isFinite(cents) || cents <= 0) continue
    if (!permitidos.has(cents)) return cents
  }
  return null
}

/**
 * ¿El texto menciona EXACTAMENTE este importe? Es lo que distingue «Alberto aprobó un mensaje que
 * cotiza la cuna a 20€» de «Alberto aprobó un mensaje que habla de la cuna». Solo lo primero es una
 * oferta con precio, y solo una oferta con precio puede cobrarse después sin volver a preguntarle.
 */
export function mencionaImporte(texto: string, cents: number): boolean {
  for (const m of (texto || '').matchAll(RE_IMPORTE)) {
    const crudo = (m[1] ?? m[2] ?? '').replace(',', '.')
    if (Math.round(Number(crudo) * 100) === cents) return true
  }
  return false
}
