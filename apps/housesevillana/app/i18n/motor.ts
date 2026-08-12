// apps/housesevillana/app/i18n/motor.ts
//
// Motor de traducción de la landing, común a todos los idiomas.
//
// La página española (`app/route.ts`) es la ÚNICA fuente: el resto de idiomas se derivan
// de su HTML aplicando un diccionario. No hay copias del fichero, y eso es deliberado:
// el agente SEO de sivra reescribe `app/route.ts` sola cada lunes por la GitHub Contents
// API, así que cualquier copia se quedaría atrás en silencio a la primera pasada.

/** Un idioma derivado del español. */
export type Variante = {
  /** Valor del atributo `lang` y del prefijo de ruta: 'en', 'it'… */
  codigo: string
  /** Valor de `og:locale`, p. ej. 'en_GB'. */
  ogLocale: string
  /** Diccionario con las cadenas EXACTAS del HTML español como clave. */
  diccionario: Record<string, string>
}

/**
 * Sustituye las cadenas del diccionario, de la más larga a la más corta.
 *
 * El orden no es un detalle: si «La casa» se aplicara antes que «La casa por dentro», la
 * segunda quedaría medio traducida y con una frase sin sentido.
 */
export function traducir(html: string, diccionario: Record<string, string>): string {
  let out = html
  for (const es of Object.keys(diccionario).sort((a, b) => b.length - a.length)) {
    out = out.split(es).join(diccionario[es])
  }
  return out
}

/**
 * Traduce y ajusta los metadatos propios de la variante: idioma del documento, canonical
 * y og:locale. Los `hreflang` no se tocan porque ya vienen del HTML español y son
 * correctos para todas las variantes: declaran todas las versiones más el x-default.
 */
export function localizar(html: string, v: Variante): string {
  return traducir(html, v.diccionario)
    .replace('<html lang="es">', `<html lang="${v.codigo}">`)
    .replace(
      '<link rel="canonical" href="https://www.housesevillana.es/"/>',
      `<link rel="canonical" href="https://www.housesevillana.es/${v.codigo}"/>`,
    )
    .replace('content="es_ES"', `content="${v.ogLocale}"`)
}

/** Cabeceras comunes a todas las variantes. */
export const CABECERAS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const
