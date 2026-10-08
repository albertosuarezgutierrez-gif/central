// Traza de un trabajo del tarificador RPA (08/10/2026): QUÉ pasos dio el bot, cuánto tardó cada uno y con qué
// código falló. PURO: lo usan el worker (para construirla) y asegura (para validarla antes de guardarla).
//
// 🔒 Nada de datos personales ni valores de formulario: un paso son EXACTAMENTE cinco claves
//    (paso, inicio, duracionMs, ok, errorCodigo) y el nombre del paso sale de una lista cerrada. Cualquier otra clave
//    (nombre, dni, email, valor…) invalida TODA la traza: ante la duda, no se guarda nada (el resultado del trabajo
//    sí se guarda: la traza es accesoria).
// 🔑 Nunca se lee ni se anota una credencial: la traza no recibe nada de `ctx.credenciales`.

import { TIPOS_ERROR } from './estados.ts'

/** Pasos que el bot sabe registrar. Cerrada a propósito: un nombre libre sería un canal para colar datos. */
export const PASOS_TRAZA = ['login', 'navegacion', 'formulario', 'tarificar', 'lectura_primas'] as const
export type NombrePasoTraza = (typeof PASOS_TRAZA)[number]

/** Códigos de error de un paso: los tipos del contrato + dos propios de la traza. */
export const CODIGOS_ERROR_TRAZA = [...TIPOS_ERROR, 'tope_tiempo', 'desconocido'] as const
export type CodigoErrorTraza = (typeof CODIGOS_ERROR_TRAZA)[number]

export type PasoTraza = {
  paso: NombrePasoTraza
  /** ISO 8601 UTC. */
  inicio: string
  duracionMs: number
  ok: boolean
  /** `null` si ok. */
  errorCodigo: CodigoErrorTraza | null
}

export const MAX_PASOS_TRAZA = 40
const MAX_DURACION_MS = 3_600_000
const CLAVES_PERMITIDAS: readonly string[] = ['paso', 'inicio', 'duracionMs', 'ok', 'errorCodigo']

export const esNombrePasoTraza = (v: unknown): v is NombrePasoTraza => typeof v === 'string' && (PASOS_TRAZA as readonly string[]).includes(v)
export const esCodigoErrorTraza = (v: unknown): v is CodigoErrorTraza => typeof v === 'string' && (CODIGOS_ERROR_TRAZA as readonly string[]).includes(v)

export type ValidacionTraza = { ok: true; pasos: PasoTraza[] } | { ok: false; errores: string[] }

/**
 * Valida y normaliza una traza recibida del worker. Rechaza (sin guardar nada) si algún paso trae una clave que no
 * sea de las cinco permitidas, un nombre de paso fuera de la lista, un código de error desconocido, una fecha o
 * duración absurdas, o más de `MAX_PASOS_TRAZA` pasos. `undefined`/`null` = sin traza (ok, vacía).
 */
export function validarTraza(entrada: unknown): ValidacionTraza {
  if (entrada === undefined || entrada === null) return { ok: true, pasos: [] }
  if (!Array.isArray(entrada)) return { ok: false, errores: ['pasos tiene que ser una lista'] }
  if (entrada.length > MAX_PASOS_TRAZA) return { ok: false, errores: [`más de ${MAX_PASOS_TRAZA} pasos`] }
  const errores: string[] = []
  const pasos: PasoTraza[] = []
  entrada.forEach((p, i) => {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      errores.push(`pasos[${i}]: no es un objeto`)
      return
    }
    const o = p as Record<string, unknown>
    // Se nombra la clave sobrante, nunca su valor (podría ser el dato personal).
    for (const k of Object.keys(o)) if (!CLAVES_PERMITIDAS.includes(k)) errores.push(`pasos[${i}]: clave no permitida «${k.slice(0, 30)}»`)
    if (!esNombrePasoTraza(o.paso)) errores.push(`pasos[${i}].paso: fuera de la lista`)
    const ms = typeof o.inicio === 'string' ? Date.parse(o.inicio) : NaN
    if (!Number.isFinite(ms)) errores.push(`pasos[${i}].inicio: fecha inválida`)
    if (typeof o.duracionMs !== 'number' || !Number.isInteger(o.duracionMs) || o.duracionMs < 0 || o.duracionMs > MAX_DURACION_MS) {
      errores.push(`pasos[${i}].duracionMs: entero entre 0 y ${MAX_DURACION_MS}`)
    }
    if (typeof o.ok !== 'boolean') errores.push(`pasos[${i}].ok: tiene que ser booleano`)
    const codigo = o.errorCodigo === undefined ? null : o.errorCodigo
    if (codigo !== null && !esCodigoErrorTraza(codigo)) errores.push(`pasos[${i}].errorCodigo: código desconocido`)
    if (o.ok === true && codigo !== null) errores.push(`pasos[${i}]: un paso ok no lleva código de error`)
    if (!errores.length) {
      pasos.push({
        paso: o.paso as NombrePasoTraza,
        inicio: new Date(ms).toISOString(),
        duracionMs: o.duracionMs as number,
        ok: o.ok as boolean,
        errorCodigo: codigo as CodigoErrorTraza | null,
      })
    }
  })
  return errores.length ? { ok: false, errores } : { ok: true, pasos }
}

export type Traza = {
  /** Ejecuta `fn` midiendo el paso; registra ok/fallo y RELANZA el error tal cual (no cambia el flujo del adaptador). */
  paso: <T>(nombre: NombrePasoTraza, fn: () => Promise<T>) => Promise<T>
  /** Copia de los pasos registrados hasta ahora (orden de ejecución). */
  pasos: () => PasoTraza[]
}

/**
 * Registrador de pasos para el worker. `codigoDe` convierte un error en uno de los códigos permitidos (el worker pasa su
 * `clasificar`); lo que devuelva fuera de la lista cae a `desconocido`. El mensaje del error NO se guarda aquí.
 * Tras `MAX_PASOS_TRAZA` pasos deja de registrar (no de ejecutar).
 */
export function crearTraza(codigoDe: (e: unknown) => string, ahora: () => number = Date.now): Traza {
  const lista: PasoTraza[] = []
  return {
    async paso(nombre, fn) {
      const t0 = ahora()
      const registrar = (ok: boolean, e?: unknown) => {
        if (lista.length >= MAX_PASOS_TRAZA) return
        let codigo: CodigoErrorTraza | null = null
        if (!ok) {
          let c = 'desconocido'
          try { c = codigoDe(e) } catch { /* el clasificador no debe romper la traza */ }
          codigo = esCodigoErrorTraza(c) ? c : 'desconocido'
        }
        lista.push({ paso: nombre, inicio: new Date(t0).toISOString(), duracionMs: Math.min(Math.max(0, Math.round(ahora() - t0)), MAX_DURACION_MS), ok, errorCodigo: codigo })
      }
      try {
        const r = await fn()
        registrar(true)
        return r
      } catch (e) {
        registrar(false, e)
        throw e
      }
    },
    pasos: () => lista.map((p) => ({ ...p })),
  }
}

/** Versión del adaptador: `major.minor.patch` (la misma forma que exige el CHECK de la BD). */
export const PATRON_VERSION_BOT = /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/
export const esVersionBot = (v: unknown): v is string => typeof v === 'string' && PATRON_VERSION_BOT.test(v)
