// lib/sivra/agente-huesped/idiomas.ts — tabla ÚNICA de idiomas del huésped. PURO.
//
// Hasta el 24/09/2026 había cuatro listas distintas (5 idiomas en el agente, 18 en los mensajes
// programados) y cualquier huésped fuera de ellas recibía el mensaje en español o en inglés sin que
// nada lo avisara. Aquí se nombran todos los que un canal (Smoobu/Booking/Airbnb) puede traer.
// Nombres en español porque todos los prompts que los usan están en español.

export const NOMBRE_IDIOMA: Record<string, string> = {
  es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano', pt: 'portugués',
  nl: 'neerlandés', ca: 'catalán', eu: 'euskera', gl: 'gallego', pl: 'polaco', cs: 'checo',
  sk: 'eslovaco', sl: 'esloveno', hr: 'croata', sr: 'serbio', bs: 'bosnio', mk: 'macedonio',
  bg: 'búlgaro', ro: 'rumano', hu: 'húngaro', el: 'griego', tr: 'turco', ru: 'ruso',
  uk: 'ucraniano', be: 'bielorruso', lt: 'lituano', lv: 'letón', et: 'estonio', fi: 'finés',
  sv: 'sueco', da: 'danés', no: 'noruego', nb: 'noruego', is: 'islandés', ga: 'irlandés',
  sq: 'albanés', mt: 'maltés', he: 'hebreo', ar: 'árabe', fa: 'persa', ur: 'urdu', hi: 'hindi',
  bn: 'bengalí', th: 'tailandés', vi: 'vietnamita', id: 'indonesio', ms: 'malayo',
  tl: 'filipino', zh: 'chino', ja: 'japonés', ko: 'coreano', ka: 'georgiano', hy: 'armenio',
  kk: 'kazajo', az: 'azerí', af: 'afrikáans', sw: 'suajili',
}

/** ¿Es un código de idioma que sabemos nombrar? (ISO 639-1, dos letras, minúsculas). */
export function idiomaConocido(cod: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOMBRE_IDIOMA, cod)
}

/** Nombre en español del idioma; si el código no está en la tabla, el propio código. */
export function nombreIdioma(cod: string): string {
  return NOMBRE_IDIOMA[cod] || cod
}
