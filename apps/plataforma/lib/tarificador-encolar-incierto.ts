// «Encolar» al bot (19/10/2026): ¿el fallo de la llamada a asegura prueba que NO se encoló, o puede haberse encolado?
// PURO: sin red ni envs (importable desde 'use client'). Incidente: «Pedir precio a todas» dijo «0 encoladas, 3 rechazadas ·
// no se pudo conectar con asegura» y asegura SÍ había encolado y lanzado la máquina (la respuesta se perdió/tardó; el encolar
// lanza Fly de forma síncrona). Un corte DESPUÉS de enviar la petición NO es «rechazada»: es «incierto».

/** Códigos que prueban que la petición ni siquiera salió (no hay conexión): ahí SÍ se puede afirmar «no se encoló». */
const CAUSAS_SIN_CONEXION = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'] as const

export const MENSAJE_ENCOLAR_INCIERTO = 'asegura tarda en responder; puede que se haya encolado — comprueba el estado en unos segundos.'
export const MENSAJE_ENCOLAR_SIN_CONEXION = 'No se pudo conectar con asegura: no se ha encolado nada.'

export type VeredictoEncolar = 'respuesta' | 'sin_conexion' | 'incierto'

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/**
 * Clasifica el resultado de `POST /api/correduria/tarificador/encolar` (status + JSON):
 *  · `respuesta`: asegura (o la propia ruta, antes de llamarla) contestó con un veredicto → se lee con `leerEncoladoBot`.
 *  · `sin_conexion`: error de red que prueba que la petición no salió (ECONNREFUSED/DNS) → seguro que NO se encoló.
 *  · `incierto`: timeout/abort, conexión cortada (ECONNRESET, UND_ERR_SOCKET…), 502/504 sin cuerpo con mensaje → PUEDE haberse
 *    encolado. Los 502 de la propia ruta llevan `mensaje` (fallaron ANTES de encolar) y son `respuesta`. PURA.
 */
export function clasificarEncolar(status: number, json: unknown): VeredictoEncolar {
  if (status !== 502 && status !== 504 && status !== 408) return 'respuesta'
  const o = obj(json)
  if (typeof o?.mensaje === 'string' && o.mensaje.trim()) return 'respuesta'
  if (o?.motivo === 'red' && typeof o.causa === 'string' && (CAUSAS_SIN_CONEXION as readonly string[]).includes(o.causa)) return 'sin_conexion'
  return 'incierto'
}

/** Cuánto esperar entre reintentos y cuántos: el reintento es seguro porque asegura devuelve `duplicado: true` del trabajo vivo. */
export const REINTENTO_INCIERTO_MS = 8_000
export const REINTENTOS_INCIERTO = 3
