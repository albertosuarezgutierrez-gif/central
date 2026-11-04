// HUELLA del riesgo de un trabajo de tarificar (05/11/2026, revisión de arquitectura del 04/11 punto 4). PURO.
//
// Para qué: (1) un índice único parcial impide DOS trabajos vivos con el mismo encargo (dos pulsaciones a la vez), y (2) un
// `ok` con precio de hace < 24 h con la misma huella se REUTILIZA en vez de lanzar otro bot (se avisa «precio de hace X h»).
//
// Qué entra: correduría, cliente, oportunidad, póliza, compañía, ramo, modo y el riesgo TAL CUAL se guarda al encolar
// (JSON canónico: claves ordenadas). NO el riesgo purgado: la purga de auto/moto quita conductor y tomador, y dos
// conductores distintos con el mismo coche y CP darían la MISMA huella → precio ajeno. Por eso también va el cliente: lo
// que se inyecta al entregar (NIF, nacimiento del tomador de SU ficha) no está en el riesgo guardado.
//
// 🔒 Sin datos personales en claro: HMAC-SHA256 con un secreto del servidor (mismo patrón que la caché de matrículas,
// `tarificador-vehiculo-reglas.ts`). Un SHA-256 a pelo de un riesgo con fechas de nacimiento se podría tantear; sin el secreto, no.
// Sin secreto → sin huella (`null`): se encola como antes (el duplicado por igualdad jsonb sigue), nunca se inventa.
//
// Hogar queda FUERA (revisión, tarificador-duplicados.ts): su riesgo purgado no distingue viviendas y el camino de
// duplicados de hogar es deliberadamente más estrecho; no se le añade una caché que no se ha probado con viviendas.

import { createHmac } from 'node:crypto'

export const VENTANA_CACHE_OK_MS = 24 * 60 * 60_000
export const RAMOS_SIN_HUELLA: readonly string[] = Object.freeze(['hogar'])
const RE_HUELLA = /^[0-9a-f]{64}$/

/** JSON con las claves de cada objeto ORDENADAS (dos riesgos iguales con otro orden de claves dan el mismo texto). */
export function jsonCanonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : jsonCanonico(x))).join(',')}]`
  const o = v as Record<string, unknown>
  const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort()
  return `{${claves.map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`
}

export type EntradaHuella = {
  correduriaId: string
  clienteId: string | null
  oportunidadId: string | null
  polizaId: string | null
  compania: string
  ramo: string
  modo: string | null
  riesgo: unknown
}

/** ¿Este trabajo lleva huella? Solo TARIFICAR y nunca hogar. */
export function llevaHuella(ramo: string, modo: string | null): boolean {
  return (modo === null || modo === 'tarificar') && !RAMOS_SIN_HUELLA.includes(ramo)
}

/** La huella (64 hex) o `null` (sin secreto, ramo/modo fuera, riesgo que no es objeto). */
export function huellaRiesgo(e: EntradaHuella, secreto: string | null | undefined): string | null {
  if (typeof secreto !== 'string' || secreto.trim() === '') return null
  if (!llevaHuella(e.ramo, e.modo)) return null
  if (!e.riesgo || typeof e.riesgo !== 'object' || Array.isArray(e.riesgo)) return null
  const cuerpo = jsonCanonico([e.correduriaId, e.clienteId, e.oportunidadId, e.polizaId, e.compania, e.ramo, e.modo ?? 'tarificar', e.riesgo])
  return createHmac('sha256', secreto).update(`tarificador-huella:v1\n${cuerpo}`).digest('hex')
}

export function esHuella(v: unknown): v is string {
  return typeof v === 'string' && RE_HUELLA.test(v)
}

/** ¿Un `ok` previo con la misma huella sirve? Solo CON precio y terminado hace < 24 h (hora de la BD); sin hora o futura → no. */
export function okReutilizable(f: { terminadoAt: Date | null; conPrecio: boolean; ahora: Date }): boolean {
  if (!f.conPrecio || !(f.terminadoAt instanceof Date)) return false
  const edad = f.ahora.getTime() - f.terminadoAt.getTime()
  return Number.isFinite(edad) && edad >= 0 && edad < VENTANA_CACHE_OK_MS
}

/** Horas enteras desde el `ok` (redondeo hacia abajo). */
export function horasDesde(terminadoAt: Date, ahora: Date): number {
  return Math.max(0, Math.floor((ahora.getTime() - terminadoAt.getTime()) / 3_600_000))
}

export function mensajeReutilizado(terminadoAt: Date, ahora: Date): string {
  const h = horasDesde(terminadoAt, ahora)
  const cuando = h < 1 ? 'hace menos de 1 h' : `hace ${h} h`
  return `Precio reutilizado de ${cuando} (mismo riesgo, misma compañía): no se ha lanzado otro bot.`
}
