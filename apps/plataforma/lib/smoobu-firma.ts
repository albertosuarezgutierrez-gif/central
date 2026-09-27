import { createHash, createHmac, randomUUID } from 'node:crypto'

// Firma HMAC-SHA256 de la API de Smoobu (esquema vigente; el legacy `Api-Key` se
// apaga el 25/09/2026). Módulo PURO a propósito: sin `@/`, sin Prisma y sin red,
// para poder contrastarlo con `node --test` contra el ejemplo oficial de Smoobu.
//
// CANONICAL = METHOD \n PATH \n QUERY \n TIMESTAMP \n NONCE \n BODY_HASH \n API_KEY
//   · METHOD    en mayúsculas
//   · PATH      solo el pathname, sin dominio ni query
//   · QUERY     parámetros ORDENADOS alfabéticamente por clave, `k=v&k2=v2`; vacío si no hay
//   · BODY_HASH SHA-256 en HEXADECIMAL del cuerpo exacto que se envía
//   · API_KEY   el propio api key, literal (no hasheado)
// SIGNATURE = Base64( HMAC-SHA256( key = API_SECRET, message = CANONICAL ) )
//
// 🚨 El hash del cuerpo va en HEX y la firma final en BASE64. No son intercambiables:
// mezclarlos da un 401 idéntico al de una credencial mala.

/** SHA-256 hex de la cadena vacía. Es el BODY_HASH de toda petición sin cuerpo (GET…). */
export const HASH_CUERPO_VACIO =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export function hashCuerpo(body?: string | null): string {
  if (!body) return HASH_CUERPO_VACIO
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

/**
 * Query canónica: `clave=valor` ordenado alfabéticamente por clave, tal cual
 * (sin URL-encode extra). Sin parámetros devuelve `''` — pero la LÍNEA sigue
 * existiendo en el canonical (por eso el ejemplo POST tiene dos `\n` seguidos).
 *
 * 🚨 EXCEPCIÓN NO DOCUMENTADA (15/09/2026): las rutas de `/api/rates` firman con
 * `apartments[]=<id>` en la URL real (es el formato que exige el propio endpoint,
 * confirmado en su doc), pero la sección de autenticación HMAC de Smoobu NO trae
 * ningún ejemplo con parámetros en formato array — comprobado leyendo la página
 * entera, sin resultado. Diagnóstico (15/09/2026): `/api/rates` lleva 4+ días en
 * 401 mientras `/api/reservations` (mismo secreto, mismo `smoobuFetch`, sin
 * parámetros array) funciona sin problema — la única diferencia estructural entre
 * ambas llamadas es esta.
 *
 * Hipótesis de trabajo (backend típico PHP/Node): al verificar la firma, el
 * servidor reconstruye el query string desde el array YA PARSEADO
 * (`apartments[]=X` → `{apartments: ['X']}`), y esa reconstrucción por defecto en
 * PHP y en `qs` (Node) da `apartments[0]=X`, no `apartments[]=X`. Por eso el
 * CANONICAL (solo para firmar, nunca para la URL real que sí lleva `[]`) reescribe
 * `clave[]` → `clave[0]`, `clave[1]`... por orden de aparición. Sin ejemplo oficial
 * que lo confirme — es la hipótesis más plausible tras agotar la documentación
 * pública, no un dato verificado. Si no resuelve el 401, revertir este bloque es
 * seguro (deja `apartments[]=X` tal cual, el comportamiento previo).
 */
export function queryCanonica(params: URLSearchParams | string): string {
  const sp = typeof params === 'string' ? new URLSearchParams(params) : params
  const indice = new Map<string, number>()
  const pares: [string, string][] = []
  sp.forEach((valor, clave) => {
    if (clave.endsWith('[]')) {
      const base = clave.slice(0, -2)
      const i = indice.get(base) ?? 0
      indice.set(base, i + 1)
      pares.push([`${base}[${i}]`, valor])
    } else {
      pares.push([clave, valor])
    }
  })
  // `numeric: true` para que `clave[2]` ordene antes que `clave[10]` (alfabético
  // puro los invertiría a partir del 10º valor array — hoy inalcanzable, los 3
  // callers mandan un único `apartments[]`, pero no debe quedar como una bomba).
  pares.sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  return pares.map(([k, v]) => `${k}=${v}`).join('&')
}

export type PartesCanonical = {
  method: string
  path: string
  query: string
  timestamp: string
  nonce: string
  bodyHash: string
  apiKey: string
}

export function construirCanonical(p: PartesCanonical): string {
  return [
    p.method.toUpperCase(),
    p.path,
    p.query,
    p.timestamp,
    p.nonce,
    p.bodyHash,
    p.apiKey,
  ].join('\n')
}

export function firmarCanonical(canonical: string, apiSecret: string): string {
  return createHmac('sha256', apiSecret).update(canonical, 'utf8').digest('base64')
}

/** ISO 8601 UTC con segundos y `Z` (`2026-04-01T12:00:00Z`). Smoobu rechaza >5 min de desfase. */
export function selloTiempo(ahora: Date = new Date()): string {
  return ahora.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export type PeticionFirmable = {
  method: string
  /** URL completa o solo el pathname+query. */
  url: string
  body?: string | null
  apiKey: string
  apiSecret: string
  /** Solo para tests: en producción se generan solos. */
  timestamp?: string
  nonce?: string
}

/**
 * Devuelve los 4 headers de auth. Faltando uno, Smoobu responde 401 aunque la
 * firma sea correcta; el nonce NO se reutiliza jamás (401 aunque todo lo demás cuadre).
 */
export function firmarPeticion(p: PeticionFirmable): {
  headers: Record<string, string>
  canonical: string
} {
  const u = new URL(p.url, 'https://login.smoobu.com')
  const timestamp = p.timestamp ?? selloTiempo()
  const nonce = p.nonce ?? randomUUID()
  const canonical = construirCanonical({
    method: p.method,
    path: u.pathname,
    query: queryCanonica(u.searchParams),
    timestamp,
    nonce,
    bodyHash: hashCuerpo(p.body),
    apiKey: p.apiKey,
  })
  return {
    canonical,
    headers: {
      'X-API-Key': p.apiKey,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': firmarCanonical(canonical, p.apiSecret),
    },
  }
}
