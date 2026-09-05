// Configuración de la medición de visitas de la web pública.
//
// 🚨 LA INVARIANTE DE ESTE ARCHIVO, y la razón de que sea un módulo aparte y
// testeado en vez de tres `process.env` sueltos en un componente:
//
//     SIN BANNER DE CONSENTIMIENTO NO HAY MEDICIÓN. NUNCA.
//
// PostHog y Cookiebot se configuran o no se configuran JUNTOS. Si falta
// cualquiera de las tres variables —o si alguna tiene una forma que no es la
// suya— esta función devuelve `null` y la web se sirve sin analítica y sin
// banner, que es exactamente lo que describe la política de privacidad cuando
// no hay medición. Lo que NO puede pasar nunca es lo intermedio: cargar PostHog
// con el identificador de Cookiebot mal escrito deja al visitante medido sin
// que nadie le haya preguntado, y desde fuera se ve idéntico a una web bien
// configurada. Es el fallo del art. 22.2 LSSI, y además es el patrón que
// `CLAUDE.md` llama «un "no lo sé" disfrazado de valor».
//
// Por eso aquí no hay ningún `?? ''` ni ningún valor por defecto: una variable
// ausente es una variable ausente, y su consecuencia es apagar la medición
// entera, no arrancar a medias.
//
// 📌 Y por eso tampoco hay excepción para desarrollo. La tentación es escribir
// `if (NODE_ENV !== 'production') return true` en la comprobación de
// consentimiento «para poder probar»; el repo ya tiene un caso donde un
// comentario afirmaba justo eso y era falso, y nadie lo descubrió hasta
// leerlo línea a línea. Para probar en local se ponen las tres variables en
// `.env.local` y se acepta el banner como cualquier visitante.

/** Las tres variables que hacen falta, ya validadas. */
export type ConfigAnalitica = {
  /** Clave de proyecto de PostHog (`phc_…`). Es pública por diseño. */
  clave: string
  /** Origen de la API de PostHog, sin barra final (`https://eu.i.posthog.com`). */
  host: string
  /** Identificador de dominio de Cookiebot (CBID), en formato UUID. */
  cookiebotId: string
}

/** Fuente de variables. Se inyecta para poder testear sin tocar `process.env`. */
export type Entorno = {
  NEXT_PUBLIC_POSTHOG_KEY?: string
  NEXT_PUBLIC_POSTHOG_HOST?: string
  NEXT_PUBLIC_COOKIEBOT_ID?: string
}

/** El CBID de Cookiebot es un UUID. Cualquier otra cosa es una errata. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Las claves de proyecto de PostHog empiezan por `phc_`. */
const CLAVE_POSTHOG = /^phc_[A-Za-z0-9]{16,}$/

/**
 * Lee y valida las tres variables. Devuelve `null` si falta o falla cualquiera.
 *
 * Devolver `null` **no es un error**: es el estado normal de una preview o de
 * un entorno local sin configurar, y significa «esta página no mide nada».
 */
export function leerConfigAnalitica(env: Entorno): ConfigAnalitica | null {
  const clave = (env.NEXT_PUBLIC_POSTHOG_KEY || '').trim()
  const hostBruto = (env.NEXT_PUBLIC_POSTHOG_HOST || '').trim()
  const cookiebotId = (env.NEXT_PUBLIC_COOKIEBOT_ID || '').trim()

  if (!CLAVE_POSTHOG.test(clave)) return null
  if (!UUID.test(cookiebotId)) return null

  // El host tiene que ser una URL https de verdad. Un valor a medias
  // (`eu.i.posthog.com` sin esquema, un `http://`) haría que PostHog mandara
  // los eventos a una URL relativa de nuestro propio dominio y se perdieran en
  // silencio: 404 en nuestros logs y cero visitas medidas, sin ningún error.
  let host: string
  try {
    const u = new URL(hostBruto)
    if (u.protocol !== 'https:') return null
    host = u.origin
  } catch {
    return null
  }

  return { clave, host, cookiebotId }
}

/** Configuración efectiva de este despliegue (`null` = web sin medición). */
export const CONFIG_ANALITICA: ConfigAnalitica | null = leerConfigAnalitica({
  // Next sustituye estas expresiones en tiempo de build, así que tienen que
  // escribirse enteras: `process.env[nombre]` no lo sustituye y quedaría a
  // `undefined` en el navegador.
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_COOKIEBOT_ID: process.env.NEXT_PUBLIC_COOKIEBOT_ID,
})
