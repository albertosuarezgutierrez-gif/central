// lib/sivra/mensajes-prog/traducir.ts — traducción de un mensaje programado al idioma de la reserva.
//
// Las plantillas son deterministas en español; la IA SOLO traduce. Como por el mensaje viajan
// códigos de puertas, URLs y horas, una traducción que los corrompa es peor que no traducir:
// `conservaDatos` (pura, testeada) exige que toda secuencia de dígitos y toda URL del original
// sobrevivan intactas, y si no, se envía el ESPAÑOL (que es lo que Smoobu hace hoy con todo, así
// que el fallback nunca es peor que el statu quo).

import { aiComplete } from '@central/core-ai'

const NOMBRE_IDIOMA: Record<string, string> = {
  en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano', pt: 'portugués', nl: 'neerlandés',
  pl: 'polaco', tr: 'turco', ru: 'ruso', sv: 'sueco', da: 'danés', no: 'noruego', cs: 'checo',
  sl: 'esloveno', ro: 'rumano', hu: 'húngaro', el: 'griego', ca: 'catalán',
}

// PURA. ¿La traducción conserva todos los datos duros del original?
//  - Toda secuencia de ≥2 dígitos (códigos, horas, teléfonos, números de portal).
//  - Toda URL http(s).
// Se compara por multiconjunto laxo: cada dato del original debe aparecer en la traducción al
// menos tantas veces como en el original no hace falta — basta con que aparezca (un código repetido
// dos veces que quede una sigue siendo utilizable; uno MUTADO no).
export function conservaDatos(orig: string, trad: string): boolean {
  if (!trad.trim()) return false
  const datos = (s: string) => [
    ...(s.match(/\d[\d#]{1,}/g) || []),
    ...(s.match(/https?:\/\/[^\s)]+/g) || []),
  ]
  const enTrad = new Set(datos(trad))
  return datos(orig).every(d => enTrad.has(d))
}

// Traduce `texto` al idioma dado. Devuelve el texto FINAL a enviar y el idioma real en que va.
// `es`, vacío o desconocido → español tal cual. Fallo de IA o datos corrompidos → español.
export async function traducirMensaje(texto: string, idioma: string): Promise<{ texto: string; idioma: string }> {
  const lang = (idioma || '').trim().toLowerCase().slice(0, 2)
  if (!lang || lang === 'es' || !NOMBRE_IDIOMA[lang]) return { texto, idioma: 'es' }
  try {
    const trad = (await aiComplete(
      [{ role: 'user', content: texto }],
      {
        system:
          `Traduce el mensaje al ${NOMBRE_IDIOMA[lang]}, con tono cercano de anfitrión de apartamento turístico. ` +
          'Devuelve SOLO la traducción. Conserva EXACTAMENTE los números, códigos, horas y URLs tal y como están; ' +
          'no traduzcas nombres propios de calles ni del apartamento.',
        maxTokens: 1600,
      },
    )).trim()
    if (conservaDatos(texto, trad)) return { texto: trad, idioma: lang }
  } catch { /* fallback abajo */ }
  return { texto, idioma: 'es' }
}
