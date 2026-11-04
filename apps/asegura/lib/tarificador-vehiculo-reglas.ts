// CONSULTA DE VEHÍCULO POR MATRÍCULA con el bot RPA (04/11/2026) — reglas PURAS. La parte con BD está en `tarificador-vehiculo.ts`;
// SQL en prisma/sql/2026-11-04e_tarificador_vehiculo_matricula.sql; worker: services/tarificador-rpa/src/vehiculo.ts.
//
// Para qué: sacar marca/modelo/versión/1ª matriculación de una MATRÍCULA con el bot de Allianz (gratis) en vez de Avant2
// `GET /vehicles?registrationPlate=` (cuesta créditos: lib/codeoscopic/catalogos.ts). Un trabajo `modo = 'vehiculo'` sin cliente.
// 🚨 TARIFICAR ≠ EMITIR: el worker se para en la pantalla del vehículo (ni tarjeta, ni «SIGUIENTE»).
// 🔒 La matrícula es dato del RIESGO: nunca en claro en logs ni mensajes de error (`enmascararMatriculaConsulta`); la caché la guarda
//    como HMAC (`claveCacheMatricula`), nunca en claro.

import { createHmac } from 'node:crypto'
import { esMatriculaEspanola, normalizarMatricula } from '@central/module-tarificacion'

export const MODO_VEHICULO = 'vehiculo'
/** Compañía y ramo del bot que consulta (el único con búsqueda por matrícula en el portal sin pasar por el tomador). */
export const COMPANIA_VEHICULO = 'allianz'
export const RAMO_VEHICULO = 'auto'
export const CACHE_VEHICULO_MS = 24 * 60 * 60_000
export const ESTADOS_VEHICULO_VIVOS = ['pendiente', 'en_curso', 'error_reintentable'] as const

/** Interruptor propio (apagado por defecto): sin `TARIFICADOR_VEHICULO_ACTIVO=1` ni se encola ni se reclama una consulta. */
export function vehiculoActivo(env: Record<string, string | undefined>): boolean {
  return (env.TARIFICADOR_VEHICULO_ACTIVO ?? '').trim() === '1'
}

/** Matrícula normalizada (mayúsculas, sin espacios/guiones/puntos) si es española plausible; si no, `null`. PURA. */
export function normalizarMatriculaConsulta(m: unknown): string | null {
  if (typeof m !== 'string' || m.length > 20) return null
  const s = normalizarMatricula(m)
  return /^[A-Z0-9]{4,10}$/.test(s) && esMatriculaEspanola(s) ? s : null
}

/** Para logs: solo las 3 últimas a la vista (`****BCD`). PURA. */
export function enmascararMatriculaConsulta(m: string): string {
  const s = normalizarMatricula(m)
  return s.length <= 3 ? '***' : `${'*'.repeat(Math.min(4, s.length - 3))}${s.slice(-3)}`
}

/** Clave de la caché: HMAC-SHA256 (hex) de la matrícula NORMALIZADA con un secreto del servidor. Secreto corto → lanza. PURA. */
export function claveCacheMatricula(normalizada: string, secreto: string): string {
  if (typeof secreto !== 'string' || secreto.length < 16) throw new Error('secreto de la caché de vehículos ausente')
  return createHmac('sha256', secreto).update(`vehiculo-matricula:v1:${normalizada}`).digest('hex')
}

/** ¿La fila de caché sirve aún? Solo con fecha válida, no futura (reloj raro = no se fía) y de menos de 24 h. PURA. */
export function cacheVigente(consultadoAt: Date | null | undefined, ahora: Date): boolean {
  if (!(consultadoAt instanceof Date) || Number.isNaN(consultadoAt.getTime())) return false
  const edad = ahora.getTime() - consultadoAt.getTime()
  return edad >= -60_000 && edad < CACHE_VEHICULO_MS
}

/** El riesgo del trabajo: SOLO la matrícula normalizada (el CHECK de la BD exige esta forma exacta). */
export function riesgoVehiculo(normalizada: string): { matricula: string } {
  return { matricula: normalizada }
}

export type VehiculoMatricula = { marca: string; modelo: string; version: string | null; fechaMatriculacion: string | null; combustible: string | null }
export type ResultadoVehiculo = { estado: 'ok'; vehiculo: VehiculoMatricula } | { estado: 'sin_resultado' }

export function leerPeticionVehiculo(b: unknown): { ok: true; matricula: string } | { ok: false; errores: string[] } {
  const o = b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  if (!o) return { ok: false, errores: ['el cuerpo tiene que ser un objeto JSON'] }
  if (o.ramo !== undefined && o.ramo !== RAMO_VEHICULO) return { ok: false, errores: [`ramo: solo «${RAMO_VEHICULO}»`] }
  const matricula = normalizarMatriculaConsulta(o.matricula)
  // Sin eco del valor recibido: la matrícula no va en mensajes de error.
  if (!matricula) return { ok: false, errores: ['matricula: no es una matrícula española válida'] }
  return { ok: true, matricula }
}

const RE_PII = /@|\b\d{8}[A-Z]\b|\b[XYZ]\d{7}[A-Z]\b|\bES\d{2}[\s\d]{10,}/i
/** Texto de catálogo: recortado, sin saltos, sin forma de dato personal ni de matrícula; vacío → `null`. PURA. */
function textoCatalogo(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return undefined
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (t.length > max || RE_PII.test(t)) return undefined
  return t
}

/** ¿Algún texto del vehículo contiene la matrícula consultada (normalizada)? Entonces no se guarda (no es catálogo). PURA. */
export function vehiculoContieneMatricula(v: VehiculoMatricula, normalizada: string): boolean {
  return [v.marca, v.modelo, v.version, v.combustible].some((t) => typeof t === 'string' && normalizarMatricula(t).includes(normalizada))
}

/** Fecha ISO `aaaa-mm-dd` real y no futura; otra cosa → `undefined` (inválida); ausente → `null`. PURA. */
function fechaIso(v: unknown, ahora: Date): string | null | undefined {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v || d.getTime() > ahora.getTime() || d.getUTCFullYear() < 1950) return undefined
  return v
}

/**
 * Cuerpo del worker en `/api/tarificador/vehiculo/resultado`: `{ trabajoId, resultado: 'vehiculo', estado: 'ok', vehiculo } |
 * { …, estado: 'sin_resultado' }`. ESTRICTO (claves cerradas; un `ok` sin marca y modelo no vale). Un fallo va por /resultado (`error`). PURA.
 */
export function leerResultadoVehiculoWorker(b: unknown, ahora: Date = new Date()): { ok: true; trabajoId: string; r: ResultadoVehiculo; botVersion: string | null } | { ok: false; errores: string[] } {
  const o = b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null
  if (!o) return { ok: false, errores: ['el cuerpo tiene que ser un objeto JSON'] }
  const trabajoId = typeof o.trabajoId === 'string' ? o.trabajoId.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trabajoId)) return { ok: false, errores: ['trabajoId no es un uuid'] }
  if (o.resultado !== 'vehiculo') return { ok: false, errores: ['resultado tiene que ser «vehiculo»'] }
  if (Object.keys(o).some((k) => !['trabajoId', 'resultado', 'estado', 'vehiculo', 'botVersion'].includes(k))) return { ok: false, errores: ['claves no permitidas'] }
  const botVersion = typeof o.botVersion === 'string' && /^[0-9]{1,4}\.[0-9]{1,4}\.[0-9]{1,4}$/.test(o.botVersion) ? o.botVersion : null
  if (o.estado === 'sin_resultado') {
    if (o.vehiculo !== undefined && o.vehiculo !== null) return { ok: false, errores: ['sin_resultado no lleva vehículo'] }
    return { ok: true, trabajoId, r: { estado: 'sin_resultado' }, botVersion }
  }
  if (o.estado !== 'ok') return { ok: false, errores: ['estado tiene que ser «ok» o «sin_resultado»'] }
  const v = o.vehiculo && typeof o.vehiculo === 'object' && !Array.isArray(o.vehiculo) ? (o.vehiculo as Record<string, unknown>) : null
  if (!v || Object.keys(v).some((k) => !['marca', 'modelo', 'version', 'fechaMatriculacion', 'combustible'].includes(k))) return { ok: false, errores: ['vehiculo con forma no válida'] }
  const marca = textoCatalogo(v.marca, 80)
  const modelo = textoCatalogo(v.modelo, 120)
  const version = textoCatalogo(v.version, 200)
  const combustible = textoCatalogo(v.combustible, 40)
  const fecha = fechaIso(v.fechaMatriculacion, ahora)
  const errores: string[] = []
  if (!marca) errores.push('vehiculo.marca falta o no válida')
  if (!modelo) errores.push('vehiculo.modelo falta o no válido')
  if (version === undefined) errores.push('vehiculo.version no válida')
  if (combustible === undefined) errores.push('vehiculo.combustible no válido')
  if (fecha === undefined) errores.push('vehiculo.fechaMatriculacion no válida')
  if (errores.length) return { ok: false, errores }
  return { ok: true, trabajoId, r: { estado: 'ok', vehiculo: { marca: marca!, modelo: modelo!, version: version ?? null, fechaMatriculacion: fecha ?? null, combustible: combustible ?? null } }, botVersion }
}

/** Fila de caché → resultado público (sin hash ni ids). PURA. */
export function resultadoDeFila(f: { estado: string; marca: string | null; modelo: string | null; version: string | null; fecha_matriculacion: Date | string | null; combustible: string | null }): ResultadoVehiculo | null {
  if (f.estado === 'sin_resultado') return { estado: 'sin_resultado' }
  if (f.estado !== 'ok' || !f.marca || !f.modelo) return null
  const fecha = f.fecha_matriculacion instanceof Date ? f.fecha_matriculacion.toISOString().slice(0, 10) : typeof f.fecha_matriculacion === 'string' ? f.fecha_matriculacion.slice(0, 10) : null
  return { estado: 'ok', vehiculo: { marca: f.marca, modelo: f.modelo, version: f.version, fechaMatriculacion: fecha, combustible: f.combustible } }
}
