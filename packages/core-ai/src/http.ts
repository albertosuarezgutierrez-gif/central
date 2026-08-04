// Helper HTTP con reintentos para los adaptadores de proveedor IA (identity-agnostic).
//
// Centraliza el manejo de límites de tasa (429) y errores transitorios de servidor
// (5xx) que antes tumbaban una llamada al primer intento. Los proveedores gratuitos
// que usamos (NVIDIA NIM, Groq, Gemini) devuelven 429 en ráfagas — a menudo con un
// header `Retry-After` — y muchos de esos 429 se despejan solos en 1-2 s.
//
// Estrategia:
//   · 429 y 5xx transitorios → se reintentan con backoff exponencial + jitter.
//   · Si el proveedor manda `Retry-After`, se respeta esa espera…
//   · …pero si pide esperar MÁS que `maxRetryAfterMs` (p. ej. cuota diaria agotada,
//     "retry-after: 3600"), NO se espera: se lanza de inmediato para que la app caiga
//     al siguiente proveedor (el fallback vive en cada app, no aquí).
//   · Al agotar los reintentos se lanza `AiHttpError` (status/provider/body/retryAfter),
//     conservando el mismo formato de mensaje `"<Proveedor> HTTP <status>: <body>"` que
//     antes producían los adaptadores (retrocompat de logs/pasarela).
//
// PURO como el resto del paquete: `fetch` y el `sleep` son inyectables (tests). No lee
// `process.env` ni secretos.

/** Error tipado de una respuesta HTTP no-OK de un proveedor IA. */
export class AiHttpError extends Error {
  readonly status: number
  readonly provider: string
  readonly body: string
  /** ms que el proveedor pidió esperar (`Retry-After`), o null si no lo indicó. */
  readonly retryAfterMs: number | null
  /** true si es un límite de tasa (429) — transitorio, conviene caer a otro proveedor. */
  readonly isRateLimit: boolean

  constructor(provider: string, status: number, body: string, retryAfterMs: number | null) {
    // Mismo formato que producían los adaptadores → los logs/pasarela no cambian.
    super(`${provider} HTTP ${status}: ${body.slice(0, 150)}`)
    this.name = 'AiHttpError'
    this.provider = provider
    this.status = status
    this.body = body
    this.retryAfterMs = retryAfterMs
    this.isRateLimit = status === 429
  }
}

/** ¿El error viene de un límite de tasa (429) de un proveedor IA? */
export function isRateLimitError(e: unknown): boolean {
  return e instanceof AiHttpError && e.isRateLimit
}

export interface AiRetryOptions {
  /** Etiqueta del proveedor para el mensaje de error (p. ej. 'NVIDIA', 'Groq', 'Gemini'). */
  provider?: string
  /** Reintentos tras el primer intento (default 2 → hasta 3 llamadas). */
  maxRetries?: number
  /** Backoff base en ms (default 500). */
  baseDelayMs?: number
  /** Tope de backoff por intento en ms (default 4000). */
  maxDelayMs?: number
  /** Si `Retry-After` supera esto, no se espera: se lanza para caer a otro proveedor (default 5000). */
  maxRetryAfterMs?: number
  /** Estados HTTP reintentables (default [429, 500, 502, 503, 504]). */
  retryStatuses?: number[]
  /** Señal de cancelación/timeout que se propaga a fetch y a las esperas. */
  signal?: AbortSignal
  /** fetch inyectable (tests). */
  fetchImpl?: typeof fetch
  /** sleep inyectable (tests) — por defecto un setTimeout que respeta `signal`. */
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Fuente de aleatoriedad del jitter en [0,1) (tests deterministas). Default Math.random. */
  jitter?: () => number
  /** Reloj para parsear `Retry-After` en formato fecha HTTP (tests). Default Date.now. */
  now?: () => number
}

const DEFAULT_RETRY_STATUSES = [429, 500, 502, 503, 504]

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Parsea `Retry-After` (delta-segundos o fecha HTTP) → ms, o null si ausente/ilegible. */
function parseRetryAfter(res: Response, now: () => number): number | null {
  const raw = res.headers?.get?.('retry-after')
  if (!raw) return null
  const secs = Number(raw)
  if (Number.isFinite(secs)) return Math.max(0, Math.round(secs * 1000))
  const dateMs = Date.parse(raw)
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - now())
  return null
}

/** Backoff exponencial con "equal jitter": mitad fija + mitad aleatoria, con tope. */
function computeBackoff(attempt: number, base: number, max: number, jitter: () => number): number {
  const exp = Math.min(max, base * 2 ** attempt)
  return Math.round(exp / 2 + jitter() * (exp / 2))
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * `fetch` con reintentos para proveedores IA. Devuelve la `Response` OK; si el estado no es
 * reintentable o se agotan los reintentos, lanza `AiHttpError`. Errores de red (fetch rechaza)
 * también se reintentan hasta agotar `maxRetries`.
 */
export async function fetchAI(
  url: string,
  init: RequestInit,
  opts: AiRetryOptions = {},
): Promise<Response> {
  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleepImpl ?? defaultSleep
  const jitter = opts.jitter ?? Math.random
  const now = opts.now ?? Date.now
  const provider = opts.provider ?? 'AI'
  const maxRetries = opts.maxRetries ?? 2
  const baseDelayMs = opts.baseDelayMs ?? 500
  const maxDelayMs = opts.maxDelayMs ?? 4000
  const maxRetryAfterMs = opts.maxRetryAfterMs ?? 5000
  const retryStatuses = opts.retryStatuses ?? DEFAULT_RETRY_STATUSES

  let attempt = 0
  for (;;) {
    let res: Response
    try {
      res = await doFetch(url, opts.signal ? { ...init, signal: opts.signal } : init)
    } catch (netErr) {
      // Error de red (DNS, socket, timeout de AbortSignal). Reintentable si quedan intentos
      // y la señal no fue abortada explícitamente.
      if (attempt >= maxRetries || opts.signal?.aborted) throw netErr
      await sleep(computeBackoff(attempt, baseDelayMs, maxDelayMs, jitter), opts.signal)
      attempt++
      continue
    }

    if (res.ok) return res

    const retryAfterMs = parseRetryAfter(res, now)

    const noMoreRetries = attempt >= maxRetries
    const notRetryable = !retryStatuses.includes(res.status)
    // El proveedor pide esperar más de lo que estamos dispuestos → mejor caer a otro proveedor.
    const waitsTooLong = retryAfterMs !== null && retryAfterMs > maxRetryAfterMs

    if (notRetryable || noMoreRetries || waitsTooLong) {
      throw new AiHttpError(provider, res.status, await safeText(res), retryAfterMs)
    }

    // Descartar el cuerpo para no dejar el stream colgando en algunos runtimes.
    await safeText(res)
    const delay = retryAfterMs ?? computeBackoff(attempt, baseDelayMs, maxDelayMs, jitter)
    await sleep(delay, opts.signal)
    attempt++
  }
}
