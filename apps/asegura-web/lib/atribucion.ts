// Atribución first-touch del lead y versión del texto de consentimiento, en PURO
// (sin `window`, sin red): lo testea `atribucion.test.ts`.
//
// Qué se guarda: de dónde vino la persona la PRIMERA vez en la sesión (utm_*,
// gclid, fbclid, la ruta de entrada y el ORIGEN del referrer) y cuándo. Viaja en
// el cuerpo del lead → `/api/lead` (reenvío) → plataforma, que lo vuelve a sanear
// (manda ella: `revisarAtribucion` de `apps/plataforma/lib/leads-web.ts`) y lo
// persiste con la ficha. La fuente de la ficha sigue siendo 'web'.
//
// 🚨 Sin PII, por construcción:
// - Nunca la query completa ni la URL entera: solo las claves de la lista blanca.
//   Una URL puede traer `?email=...` de una campaña mal montada, o un token.
// - Del referrer, solo el origen (`https://www.google.com`), nunca su ruta: la
//   ruta de la página anterior puede ser una búsqueda o un enlace personal.
// - Valor con `@` (un correo) o con 9+ dígitos seguidos (un teléfono, un DNI)
//   en un utm_* se DESCARTA, no se recorta: medio correo sigue siendo un correo.
// - Todo recortado a 100 caracteres.
//
// 🚨 ePrivacy (art. 22.2 LSSI): `sessionStorage` también es «almacenar en el
// equipo del usuario». La atribución no es estrictamente necesaria para el
// servicio pedido, así que SOLO se escribe en `sessionStorage` si la persona ha
// aceptado la categoría `statistics` del banner. Sin ese sí, se calcula en
// memoria desde la URL de la página del formulario y se envía con el lead (que
// la persona envía a sabiendas); no se deja nada en su navegador.

/** Versión del texto informativo/consentimiento que ve la persona al enviar. Cámbiala al cambiar el texto. */
export const CONSENTIMIENTO_VERSION = 'privacidad-2026-10-17'

/** Clave de `sessionStorage`. */
export const CLAVE_ATRIBUCION = 'gas_atribucion_v1'

export const MAX_VALOR_ATRIBUCION = 100

/** Lista blanca. Debe coincidir con `CLAVES_ATRIBUCION` de plataforma (lo vigila el test). */
export const CLAVES_ATRIBUCION = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'landing',
  'referrer',
  'fecha',
] as const
export type ClaveAtribucion = (typeof CLAVES_ATRIBUCION)[number]
export type Atribucion = Partial<Record<ClaveAtribucion, string>>

const CLAVES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const CLAVES_ID_CLIC = ['gclid', 'fbclid'] as const

// Caracteres de control (incl. DEL) y separadores Unicode raros: fuera.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

function limpio(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

/** Un utm_*: texto libre de campaña. Correo o número largo → se descarta entero. */
function valorUtm(v: unknown): string | null {
  const s = limpio(v)
  if (!s) return null
  if (s.includes('@') || /\d{9,}/.test(s.replace(/[\s.\-]/g, ''))) return null
  if (/[<>"'`\\]/.test(s)) return null
  return s.slice(0, MAX_VALOR_ATRIBUCION)
}

/** gclid/fbclid: identificador opaco; si no tiene esa forma, no es uno. */
function valorIdClic(v: unknown): string | null {
  const s = limpio(v)
  if (!s || !/^[A-Za-z0-9_-]+$/.test(s)) return null
  return s.slice(0, MAX_VALOR_ATRIBUCION)
}

/** Ruta de entrada SIN query ni fragmento. */
function valorLanding(v: unknown): string | null {
  const s = limpio(v)
  if (!s || !s.startsWith('/') || s.startsWith('//')) return null
  const ruta = s.split(/[?#]/)[0]
  if (!/^\/[A-Za-z0-9/_\-.~%]*$/.test(ruta)) return null
  return ruta.slice(0, MAX_VALOR_ATRIBUCION)
}

/** Solo el origen http(s) del referrer. */
function valorReferrer(v: unknown): string | null {
  const s = limpio(v)
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.username || u.password) return null
    return u.origin.slice(0, MAX_VALOR_ATRIBUCION)
  } catch {
    return null
  }
}

/** Fecha ISO 8601 válida (la de la primera visita). */
function valorFecha(v: unknown): string | null {
  const s = limpio(v)
  if (!s || s.length > 40 || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(s)) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/**
 * Sanea un objeto de atribución que viene de fuera (sessionStorage, un body):
 * solo claves de la lista blanca, cada valor validado y recortado. `null` si no
 * queda nada (no hay atribución que contar ≠ atribución vacía).
 */
export function sanearAtribucion(entrada: unknown): Atribucion | null {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return null
  const e = entrada as Record<string, unknown>
  const out: Atribucion = {}
  for (const k of CLAVES_UTM) {
    const v = valorUtm(e[k])
    if (v) out[k] = v
  }
  for (const k of CLAVES_ID_CLIC) {
    const v = valorIdClic(e[k])
    if (v) out[k] = v
  }
  const landing = valorLanding(e.landing)
  if (landing) out.landing = landing
  const referrer = valorReferrer(e.referrer)
  if (referrer) out.referrer = referrer
  const fecha = valorFecha(e.fecha)
  if (fecha) out.fecha = fecha
  return Object.keys(out).length > 0 ? out : null
}

/**
 * Atribución de ESTA visita, a partir de la URL actual y el referrer. Solo lee
 * las claves de la lista blanca de la query; el resto de la query no se mira.
 * Un referrer del propio sitio no es una fuente: se omite.
 */
export function capturarAtribucion(href: string, referrer: string, ahora: Date): Atribucion | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  const bruto: Record<string, string> = { landing: u.pathname, fecha: ahora.toISOString() }
  for (const k of [...CLAVES_UTM, ...CLAVES_ID_CLIC]) {
    const v = u.searchParams.get(k)
    if (v !== null) bruto[k] = v
  }
  const ref = valorReferrer(referrer)
  if (ref && ref !== u.origin) bruto.referrer = ref
  return sanearAtribucion(bruto)
}

type Almacen = Pick<Storage, 'getItem' | 'setItem'>

/**
 * First-touch: si ya hay una atribución guardada en la sesión, manda esa; si no,
 * la de esta visita, que se guarda SOLO si `puedeGuardar` (consentimiento de
 * estadística). Cualquier fallo del almacén (modo privado, cuota, bloqueado) se
 * traga y se sigue con la de esta visita: la atribución nunca impide un lead.
 */
export function atribucionFirstTouch(
  almacen: Almacen | null,
  actual: Atribucion | null,
  puedeGuardar: boolean,
): Atribucion | null {
  if (almacen) {
    try {
      const previa = almacen.getItem(CLAVE_ATRIBUCION)
      if (previa) {
        const p = sanearAtribucion(JSON.parse(previa))
        if (p) return p
      }
    } catch {
      /* ilegible o bloqueado: se sigue con la actual */
    }
    if (actual && puedeGuardar) {
      try {
        almacen.setItem(CLAVE_ATRIBUCION, JSON.stringify(actual))
      } catch {
        /* sin almacén: no pasa nada */
      }
    }
  }
  return actual
}
