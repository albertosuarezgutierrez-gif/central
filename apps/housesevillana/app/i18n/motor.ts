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
  /**
   * Ruta de la página SIN prefijo de idioma: '' para la portada, '/parking'…
   * De aquí salen las URL canónicas: la española es `…/es${ruta}` (la portada, `…/`)
   * y la de la variante `…/${codigo}${ruta}`.
   */
  ruta?: string
  /**
   * Título y descripciones de la variante, escritos por ETIQUETA y no por diccionario.
   *
   * Van aparte por una razón concreta: el agente SEO de sivra reescribe `<title>`,
   * `description` y los `og:` de `app/route.ts` cada lunes (`lib/seo-landing.ts`). Si esas
   * frases fueran claves del diccionario, el primer lunes dejarían de casar y la página
   * inglesa serviría su título y su descripción EN CASTELLANO — en el resultado de Google
   * y en la tarjeta de WhatsApp, que es justo donde se decide el clic. Al escribirlas por
   * etiqueta, la variante conserva su texto pase lo que pase con el español.
   *
   * El precio de hacerlo así: la optimización semanal del agente solo mejora el español.
   * Es el lado correcto del intercambio — un título inglés algo más viejo se lee; uno en
   * español no se pulsa.
   */
  meta?: { title: string; description: string; ogDescription: string }
}

/** URL absoluta de una página en español. La portada lleva barra final; el resto, no. */
function urlEs(ruta: string): string {
  return `https://www.housesevillana.es${ruta || '/'}`
}

/**
 * Páginas que existen en TODOS los idiomas. Sus enlaces internos se reescriben con el
 * prefijo de la variante, porque si no un visitante inglés que pulsa «Home» o «Parking»
 * aterriza en la página española — y ahí se acaba la visita.
 *
 * `/barrio` y `/que-ver` NO están aquí a propósito: hoy solo existen en español, así que
 * prefijarlas daría un 404. Cuando se traduzcan, se añaden aquí Y en el sitemap.
 */
export const RUTAS_LOCALIZADAS = ['/', '/parking'] as const

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
 * Traduce y ajusta los metadatos propios de la variante: idioma del documento, canonical,
 * og:url y og:locale.
 *
 * Los `hreflang` NO se tocan, y es deliberado: ya vienen del HTML español declarando todas
 * las versiones más el x-default, que es exactamente lo que Google espera encontrar —
 * idéntico— en cada una de ellas. Por eso canonical y og:url se sustituyen por su etiqueta
 * completa y no reemplazando la URL suelta: un `split/join` de la URL española también
 * pisaría el `hreflang="es"` y dejaría el grupo de alternativas descuadrado.
 */
export function localizar(html: string, v: Variante): string {
  const ruta = v.ruta ?? ''
  const es = urlEs(ruta)
  const destino = `https://www.housesevillana.es/${v.codigo}${ruta}`
  let out = traducir(html, v.diccionario)
  for (const r of RUTAS_LOCALIZADAS) {
    // `href="/"` no colisiona con `href="/parking"`: la comilla de cierre va en la clave.
    out = out.split(`href="${r}"`).join(`href="/${v.codigo}${r === '/' ? '' : r}"`)
  }
  out = out
    .replace('<html lang="es">', `<html lang="${v.codigo}">`)
    .replace(
      `<link rel="canonical" href="${es}"/>`,
      `<link rel="canonical" href="${destino}"/>`,
    )
    .replace(
      `<meta property="og:url" content="${es}"/>`,
      `<meta property="og:url" content="${destino}"/>`,
    )
    .replace('content="es_ES"', `content="${v.ogLocale}"`)
  if (v.meta) {
    const { title, description, ogDescription } = v.meta
    // Reemplazo por función y no por cadena: un `$&` o un `$1` dentro de una traducción
    // sería interpretado por `String.replace` y se colaría un texto que nadie escribió.
    out = out
      .replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`)
      .replace(/(<meta name="description" content=")[^"]*"/, (_m, p) => `${p}${description}"`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, (_m, p) => `${p}${title}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, (_m, p) => `${p}${ogDescription}"`)
  }
  return out
}

/** Cabeceras comunes a todas las variantes. */
export const CABECERAS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
} as const
