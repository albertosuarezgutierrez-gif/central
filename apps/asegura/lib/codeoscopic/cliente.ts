// Transporte HTTP contra Codeoscopic / Avant2: token OAuth2 + petición firmada.
//
// Dos decisiones que no son de estilo:
//
// 1. **La cotización va con UN SOLO intento.** `POST /insurances` es facturable
//    y no idempotente: un reintento no arregla nada, crea otro proyecto y otro
//    cargo de 0,50€. Aquí no hay retries ni circuit breaker para esa llamada.
//
// 2. **Los errores se clasifican por si PRUEBAN que no hubo cargo.** De eso
//    depende que el libro de consumo libere o no el cupo, así que la taxonomía
//    es parte del contrato, no un detalle de logging.

import { MEDIA_TYPE_V1, type ConfigCodeoscopic } from './config.ts'

/** Categorías de fallo. Solo las tres primeras demuestran que no se facturó. */
export type ClaseError =
  | 'auth' // 401/403: el vendor rechazó la identidad, no tarificó.
  | 'conexion' // No se llegó a ENVIAR (DNS, TLS, host caído). Prueba que no hubo cargo.
  | 'red-indeterminada' // ⚠️ Se cortó, pero pudo cortarse DESPUÉS de enviar.
  | 'validacion' // 400/422: el vendor rechazó el cuerpo antes de tarificar.
  | 'timeout' // ⚠️ NO prueba nada: pudo tarificar igual.
  | 'servidor' // ⚠️ 5xx: tampoco prueba nada.

export class ErrorCodeoscopic extends Error {
  // Campos explícitos, no `parameter properties`: `node --test` corre estos
  // ficheros en modo strip-only y ahí la forma abreviada no compila.
  readonly clase: ClaseError
  readonly detalle: string
  readonly status?: number

  constructor(clase: ClaseError, detalle: string, status?: number) {
    super(`codeoscopic_${clase}: ${detalle}`)
    this.name = 'ErrorCodeoscopic'
    this.clase = clase
    this.detalle = detalle
    this.status = status
  }

  /** ¿Este fallo demuestra que Codeoscopic NO nos ha cobrado?
   *
   *  Ojo con lo que NO está en la lista: `timeout`, `servidor` y
   *  `red-indeterminada`. En los tres la petición pudo llegar y tarificarse. */
  get pruebaQueNoHuboCargo(): boolean {
    return this.clase === 'auth' || this.clase === 'conexion' || this.clase === 'validacion'
  }
}

// ─── Token OAuth2 ────────────────────────────────────────────────────────────
// Cache en memoria por instancia. En serverless cada cold start vuelve a pedirlo,
// y no pasa nada: el token es GRATIS. Esto es cache de latencia, no de coste —
// no confundir con el libro de consumo, que sí tiene que ser persistente.
type TokenCacheado = { token: string; expiraEnMs: number }
const cacheToken = new Map<string, TokenCacheado>()

/** Vacía la cache. Se usa al auto-curar un 401 y en los tests. */
export function olvidarToken(config?: ConfigCodeoscopic): void {
  if (!config) return void cacheToken.clear()
  cacheToken.delete(`${config.tokenUrl}|${config.clientId}`)
}

/**
 * Pide (o reutiliza) el access token. **Es gratis**: por eso es la sonda con la
 * que se comprueba host y credenciales sin gastar una cotización.
 */
export async function obtenerToken(config: ConfigCodeoscopic): Promise<string> {
  const clave = `${config.tokenUrl}|${config.clientId}`
  const cacheado = cacheToken.get(clave)
  if (cacheado && cacheado.expiraEnMs > Date.now()) return cacheado.token

  const cuerpo = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })

  const res = await fetchConTimeout(
    config.tokenUrl,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
    },
    config.timeoutGenericoMs,
  )

  if (res.status === 401 || res.status === 403) {
    throw new ErrorCodeoscopic(
      'auth',
      'el vendor rechazó client_id/client_secret al pedir el token',
      res.status,
    )
  }
  if (!res.ok) {
    throw new ErrorCodeoscopic('servidor', `el token devolvió ${res.status}`, res.status)
  }

  const json = (await res.json().catch(() => null)) as
    | { access_token?: unknown; expires_in?: unknown }
    | null
  const token = typeof json?.access_token === 'string' ? json.access_token : null
  if (!token) throw new ErrorCodeoscopic('servidor', 'la respuesta del token no traía access_token')

  const duracionS = typeof json?.expires_in === 'number' ? json.expires_in : 300
  const margen = config.margenRefrescoTokenS
  cacheToken.set(clave, {
    token,
    expiraEnMs: Date.now() + Math.max(0, duracionS - margen) * 1000,
  })
  return token
}

// ─── Petición genérica ───────────────────────────────────────────────────────

/** Códigos que solo pueden ocurrir ANTES de poner la petición en el cable:
 *  no se resolvió el DNS, no se abrió el socket o no se validó el TLS. */
const FALLOS_ANTES_DE_ENVIAR = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
  'ERR_INVALID_URL',
])

/**
 * ¿Este fallo de red demuestra que la petición NUNCA se envió?
 *
 * Importa de verdad: si decimos «conexion» estamos liberando cupo y afirmando
 * que Codeoscopic no nos ha cobrado. Un `ECONNRESET` o un «other side closed»
 * pueden ocurrir DESPUÉS de que el vendor haya recibido y tarificado, así que
 * esos NO son prueba de nada y se quedan como indeterminados.
 */
export function clasificarFalloDeRed(e: unknown): 'conexion' | 'red-indeterminada' {
  const causa = (e as { cause?: { code?: unknown } } | null)?.cause
  const codigo = typeof causa?.code === 'string' ? causa.code : null
  if (codigo && FALLOS_ANTES_DE_ENVIAR.has(codigo)) return 'conexion'
  return 'red-indeterminada'
}

async function fetchConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ac.signal })
  } catch (e) {
    // Distinguir «se me acabó el tiempo» de «no llegué a conectar» es lo que
    // decide si el cupo se libera. No los mezclamos en un `catch` genérico.
    if (ac.signal.aborted) {
      throw new ErrorCodeoscopic('timeout', `sin respuesta en ${timeoutMs} ms`)
    }
    throw new ErrorCodeoscopic(
      clasificarFalloDeRed(e),
      e instanceof Error ? e.message : String(e),
    )
  } finally {
    clearTimeout(t)
  }
}

/**
 * Llama al vendor con las cabeceras que Avant2 exige.
 *
 * Un solo intento. La única repetición es el auto-curado de un 401, y es segura
 * incluso en la llamada facturable porque un 401 significa que el vendor
 * rechazó la petición SIN tarificar: no hay cargo que duplicar.
 */
export async function peticion(
  config: ConfigCodeoscopic,
  opciones: {
    metodo: 'GET' | 'POST'
    path: string
    cuerpo?: unknown
    timeoutMs: number
  },
): Promise<unknown> {
  const url = `${config.baseUrl}${opciones.path}`

  const enviar = async (token: string) =>
    fetchConTimeout(
      url,
      {
        method: opciones.metodo,
        headers: {
          authorization: `Bearer ${token}`,
          // Ambas son OBLIGATORIAS para Avant2; sin ellas responde 400.
          'x-client-app': config.clientApp,
          'x-user-email': config.userEmail,
          accept: MEDIA_TYPE_V1,
          ...(opciones.cuerpo !== undefined ? { 'content-type': MEDIA_TYPE_V1 } : {}),
        },
        ...(opciones.cuerpo !== undefined ? { body: JSON.stringify(opciones.cuerpo) } : {}),
      },
      opciones.timeoutMs,
    )

  let res = await enviar(await obtenerToken(config))

  // Auto-curado del token caducado. Seguro incluso en la llamada facturable: un
  // 401 significa que el vendor rechazó la petición SIN tarificar, así que
  // reintentar no duplica ningún cargo. Aun así solo se hace UNA vez.
  if (res.status === 401) {
    olvidarToken(config)
    res = await enviar(await obtenerToken(config))
  }

  if (res.status === 401 || res.status === 403) {
    throw new ErrorCodeoscopic('auth', 'el vendor rechazó la autenticación', res.status)
  }
  if (res.status === 400 || res.status === 422) {
    const texto = await res.text().catch(() => '')
    throw new ErrorCodeoscopic('validacion', recortar(texto), res.status)
  }
  if (!res.ok) {
    throw new ErrorCodeoscopic('servidor', `respuesta ${res.status}`, res.status)
  }

  return res.json()
}

/** Recorta el cuerpo de error: puede traer eco de datos del tomador (PII). */
function recortar(texto: string): string {
  return texto.replace(/\s+/g, ' ').slice(0, 300)
}
