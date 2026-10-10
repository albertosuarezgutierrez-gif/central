// Sesión de ePAC reutilizada y trabajos en serie (06/10/2026). Allianz NO está avisada: cuantos menos logins, mejor.
//
// 🔑 El storageState (cookies + localStorage del portal) vive SOLO en la memoria de este proceso: nunca a disco
//    (no se pasa `path` a `storageState()`), ni a BD, ni a logs (no se serializa: `toJSON`/`inspect` lo tapan).
//    TTL 10 min; se invalida ante CUALQUIER fallo del trabajo, de login o una redirección al login.
// ⚠️ Hoy cada máquina de Fly hace UN trabajo y sale: la caché solo dura lo que el proceso. Sirve tal cual si el
//    worker pasa a atender varios trabajos seguidos (y entonces `enSerie` garantiza uno a la vez).

import { inspect } from 'node:util'

/** Lo que devuelve `BrowserContext.storageState()` (sin depender aquí de Playwright). */
export type EstadoNavegador = { cookies: unknown[]; origins: unknown[] }

export const TTL_SESION_MS = 10 * 60_000

export class SesionEnMemoria {
  #estado: { valor: EstadoNavegador; hasta: number } | null = null
  readonly #ttl: number
  readonly #ahora: () => number

  constructor(ttlMs: number = TTL_SESION_MS, ahora: () => number = Date.now) {
    this.#ttl = ttlMs
    this.#ahora = ahora
  }

  /** El estado guardado si sigue vivo; si caducó, se borra y `null`. */
  obtener(): EstadoNavegador | null {
    if (!this.#estado) return null
    if (this.#ahora() >= this.#estado.hasta) {
      this.#estado = null
      return null
    }
    return this.#estado.valor
  }

  /** Guarda (o renueva) el estado con TTL completo. Solo tras un trabajo que terminó bien. */
  guardar(valor: EstadoNavegador): void {
    this.#estado = { valor, hasta: this.#ahora() + this.#ttl }
  }

  invalidar(): void {
    this.#estado = null
  }

  get viva(): boolean {
    return this.obtener() !== null
  }

  // Nunca sale el contenido aunque alguien lo pase a un log.
  toJSON(): string {
    return '[sesion]'
  }
  [inspect.custom](): string {
    return '[sesion]'
  }
}

/** Caché del proceso worker (una por proceso: la credencial de ePAC es una). */
export const sesionEpac = new SesionEnMemoria()

let cola: Promise<unknown> = Promise.resolve()

/** Ejecuta `fn` cuando haya terminado el trabajo anterior: UN trabajo a la vez por proceso. */
export function enSerie<T>(fn: () => Promise<T>): Promise<T> {
  const r = cola.then(fn, fn)
  cola = r.catch(() => undefined)
  return r
}
