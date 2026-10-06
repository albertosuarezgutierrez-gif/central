// Operación del tarificador RPA (07/10/2026): renovaciones automáticas, detector de cambio de tarifa
// y métricas del panel `/correduria/tarificador`. PURO: sin BD ni red (`node --test`).
//
// 🛡️ Allianz NO está avisada del acceso automatizado: todo lo automático aquí es de VOLUMEN BAJO y
//    ESPACIADO. Renovaciones apagadas por defecto (`TARIFICADOR_RENOVACIONES_ACTIVO=1` exacto para
//    encender), tope duro diario (`TARIFICADOR_RENOVACIONES_MAX_DIA`, 3 por defecto, nunca más de
//    `TOPE_ABSOLUTO_DIA`) y UN trabajo por pasada como mucho.
// 🚨 Nada de aquí inventa datos del riesgo: una renovación solo se encola si hay un riesgo COMPLETO ya
//    cotizado de esa póliza (o de su cliente, si no hay ambigüedad); solo cambian las fechas
//    (efecto = vencimiento). Lo que no valida → «faltan datos», sin encolar.
// 🚨 Dato que no hay ≠ 0: una prima `null` (sucesivos no leídos, prima de cartera desconocida) no se
//    compara ni se pinta como 0.

import { createHash } from 'node:crypto'
import { validarRiesgoComunidad, type RiesgoComunidad } from '@central/module-tarificacion'

// ─── Interruptores ───────────────────────────────────────────────────────────

/** Marca de origen en `tarificacion_trabajos.solicitado_por` (sin columna nueva). */
export const ORIGEN_RENOVACION = 'renovacion:cron'
export const esOrigenRenovacion = (solicitadoPor: string | null | undefined): boolean =>
  typeof solicitadoPor === 'string' && solicitadoPor.startsWith('renovacion:')

/** APAGADO salvo `TARIFICADOR_RENOVACIONES_ACTIVO=1` exacto (fail-closed). */
export function renovacionesActivas(env: Record<string, string | undefined>): boolean {
  return env.TARIFICADOR_RENOVACIONES_ACTIVO === '1'
}

export const MAX_DIA_POR_DEFECTO = 3
/** Techo que ninguna env puede superar (Allianz no está avisada). */
export const TOPE_ABSOLUTO_DIA = 10
/** Trabajos de renovación que se encolan como mucho en UNA pasada del cron (espaciado). */
export const MAX_POR_PASADA = 1

/** Tope diario: entero 0..TOPE_ABSOLUTO_DIA; ausente o basura → el valor por defecto. */
export function maxRenovacionesDia(env: Record<string, string | undefined>): number {
  const crudo = (env.TARIFICADOR_RENOVACIONES_MAX_DIA ?? '').trim()
  if (!/^\d{1,3}$/.test(crudo)) return MAX_DIA_POR_DEFECTO
  return Math.min(Number(crudo), TOPE_ABSOLUTO_DIA)
}

/** Ventana de vencimiento (días desde hoy, ambos inclusive). */
export const VENTANA_DESDE_DIAS = 45
export const VENTANA_HASTA_DIAS = 75
/** Una póliza con un trabajo del bot (no cancelado) en estos días no se vuelve a encolar. */
export const DIAS_SIN_REPETIR = 30

// ─── Fechas (ISO AAAA-MM-DD, UTC puro) ───────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/
const msDia = 86_400_000
const aUtc = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

export function diasEntre(desdeIso: string, hastaIso: string): number | null {
  if (!ISO.test(desdeIso) || !ISO.test(hastaIso)) return null
  return Math.round((aUtc(hastaIso) - aUtc(desdeIso)) / msDia)
}

export function enVentanaRenovacion(hoyIso: string, vencimientoIso: string | null): boolean {
  if (!vencimientoIso) return false
  const d = diasEntre(hoyIso, vencimientoIso)
  return d !== null && d >= VENTANA_DESDE_DIAS && d <= VENTANA_HASTA_DIAS
}

/** +1 año; el 29 de febrero pasa al 28 (no existe el 29 en el año siguiente). */
export function sumarUnAnio(iso: string): string | null {
  if (!ISO.test(iso)) return null
  const a = Number(iso.slice(0, 4)) + 1
  const mmdd = iso.slice(5) === '02-29' ? '02-28' : iso.slice(5)
  return `${a}-${mmdd}`
}

// ─── Riesgo reutilizable ─────────────────────────────────────────────────────

export type TrabajoConRiesgo = { polizaId: string | null; riesgo: unknown; creadoEn: string }

/**
 * El riesgo a reutilizar para renovar ESA póliza: el del trabajo más reciente de esa misma póliza; si no
 * hay, el más reciente del cliente SIN póliza, pero solo si el cliente tiene UNA sola póliza de
 * comunidades en vigor (con dos edificios no se sabe de cuál es). Nunca el de otra póliza.
 */
export function elegirRiesgoPrevio(trabajos: TrabajoConRiesgo[], polizaId: string, polizasComunidadDelCliente: number): unknown | null {
  const orden = [...trabajos].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  const propia = orden.find((t) => t.polizaId === polizaId)
  if (propia) return propia.riesgo
  if (polizasComunidadDelCliente !== 1) return null
  const delCliente = orden.find((t) => t.polizaId === null)
  return delCliente ? delCliente.riesgo : null
}

/** Los trabajos que son de ESA póliza: los suyos y, si el cliente solo tiene una comunidad, los sin póliza. */
export function trabajosDeLaPoliza<T extends { polizaId: string | null }>(trabajos: T[], polizaId: string, polizasComunidadDelCliente: number): T[] {
  return trabajos.filter((t) => t.polizaId === polizaId || (t.polizaId === null && polizasComunidadDelCliente === 1))
}

export type RiesgoRenovacion = { ok: true; riesgo: RiesgoComunidad } | { ok: false; faltan: string[] }

/**
 * El riesgo previo con las fechas de la renovación: efecto = vencimiento, término = vencimiento + 1 año
 * (renovación anual). Nada más cambia. Se valida con la misma regla que el encolado manual.
 */
export function riesgoParaRenovacion(previo: unknown, vencimientoIso: string, hoy: Date): RiesgoRenovacion {
  if (!previo || typeof previo !== 'object' || Array.isArray(previo)) return { ok: false, faltan: ['no hay ningún riesgo cotizado antes para esta póliza'] }
  const termino = sumarUnAnio(vencimientoIso)
  if (!termino) return { ok: false, faltan: ['la póliza no tiene una fecha de vencimiento válida'] }
  const v = validarRiesgoComunidad({ ...(previo as Record<string, unknown>), fechaEfecto: vencimientoIso, fechaTermino: termino }, hoy)
  return v.ok ? { ok: true, riesgo: v.riesgo } : { ok: false, faltan: v.errores }
}

// ─── Clasificación de una renovación ─────────────────────────────────────────

export type EstadoRenovacion = 'cotizada' | 'en_cola' | 'fallida' | 'pendiente' | 'faltan_datos'

export type TrabajoReciente = {
  trabajoId: string
  estado: string
  creadoEn: string
  /** Prima ANUAL de Allianz (sucesivos, la más barata de las ofertas). `null` = no consta. */
  primaAllianz: number | null
}

const EN_COLA = new Set(['pendiente', 'en_curso', 'error_reintentable'])
const FALLIDOS = new Set(['error_definitivo', 'requiere_humano'])

export type Clasificacion = {
  estado: EstadoRenovacion
  trabajoId: string | null
  primaAllianz: number | null
  faltan: string[]
  riesgo: RiesgoComunidad | null
}

/**
 * `recientes` = trabajos de ESA póliza en los últimos `DIAS_SIN_REPETIR` días (los cancelados no
 * cuentan). Con alguno no se encola otro: ok → cotizada; vivo → en cola; fallido → fallida (lo mira
 * una persona, el cron no insiste).
 */
export function clasificarRenovacion(recientes: TrabajoReciente[], riesgo: RiesgoRenovacion): Clasificacion {
  const orden = [...recientes].filter((t) => t.estado !== 'cancelado').sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
  const ok = orden.find((t) => t.estado === 'ok')
  if (ok) return { estado: 'cotizada', trabajoId: ok.trabajoId, primaAllianz: ok.primaAllianz, faltan: [], riesgo: null }
  const vivo = orden.find((t) => EN_COLA.has(t.estado))
  if (vivo) return { estado: 'en_cola', trabajoId: vivo.trabajoId, primaAllianz: null, faltan: [], riesgo: null }
  const fallo = orden.find((t) => FALLIDOS.has(t.estado))
  if (fallo) return { estado: 'fallida', trabajoId: fallo.trabajoId, primaAllianz: null, faltan: [], riesgo: null }
  if (!riesgo.ok) return { estado: 'faltan_datos', trabajoId: null, primaAllianz: null, faltan: riesgo.faltan, riesgo: null }
  return { estado: 'pendiente', trabajoId: null, primaAllianz: null, faltan: [], riesgo: riesgo.riesgo }
}

/**
 * Cuántas se pueden encolar en esta pasada: nada si ya hay una renovación en cola (espaciado: se espera
 * a que termine), y nunca más de `MAX_POR_PASADA` ni de lo que quede del tope diario.
 */
export function cupoPasada(p: { topeDia: number; hechasHoy: number; renovacionesEnCola: number }): number {
  if (p.renovacionesEnCola > 0) return 0
  return Math.max(0, Math.min(MAX_POR_PASADA, p.topeDia - p.hechasHoy))
}

/** Las encolables, la que antes vence primero. */
export function elegirParaEncolar<T extends { estado: EstadoRenovacion; vencimiento: string }>(lista: T[], cupo: number): T[] {
  if (cupo <= 0) return []
  return lista.filter((r) => r.estado === 'pendiente').sort((a, b) => a.vencimiento.localeCompare(b.vencimiento)).slice(0, cupo)
}

/** La prima anual de Allianz de una respuesta: la más barata de los sucesivos que consten; `null` si ninguna. */
export function primaAnualMinima(ofertas: { primaTotalSucesivos: number | null }[]): number | null {
  const v = ofertas.map((o) => o.primaTotalSucesivos).filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0)
  return v.length ? Math.min(...v) : null
}

// ─── Detector de cambio de tarifa ────────────────────────────────────────────

/** Claves que NO tarifican o que son personales/identificativas: fuera del hash. */
const EXCLUIDAS_HASH = new Set(['fechaEfecto', 'fechaTermino', 'documentoIdentidad', 'tipoDocumento', 'polizaAReemplazar', 'referenciaCatastral'])
const EXCLUIDAS_DIRECCION = new Set(['via', 'numero'])

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = canonico((v as Record<string, unknown>)[k])
      if (x !== undefined) out[k] = x
    }
    return Object.keys(out).length ? out : undefined
  }
  if (v === null || v === undefined) return undefined
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase()
    return t === '' ? undefined : t
  }
  return v
}

/** Riesgo normalizado (lo que tarifica): sin fechas ni datos personales; nulos/vacíos = ausentes. */
export function riesgoNormalizado(riesgo: unknown): Record<string, unknown> | null {
  if (!riesgo || typeof riesgo !== 'object' || Array.isArray(riesgo)) return null
  const r = riesgo as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (EXCLUIDAS_HASH.has(k)) continue
    if (k === 'direccion' && v && typeof v === 'object' && !Array.isArray(v)) {
      const d: Record<string, unknown> = {}
      for (const [dk, dv] of Object.entries(v as Record<string, unknown>)) if (!EXCLUIDAS_DIRECCION.has(dk)) d[dk] = dv
      out.direccion = d
      continue
    }
    out[k] = v
  }
  // `modalidad` ausente = estándar (es lo que hace el adaptador).
  if (out.modalidad === undefined || out.modalidad === null || out.modalidad === '') out.modalidad = 'estandar'
  const c = canonico(out)
  return c && typeof c === 'object' ? (c as Record<string, unknown>) : null
}

export function hashRiesgo(riesgo: unknown): string | null {
  const n = riesgoNormalizado(riesgo)
  return n ? createHash('sha256').update(JSON.stringify(n)).digest('hex').slice(0, 16) : null
}

export const UMBRAL_CAMBIO_PCT = 0.01
export const UMBRAL_CAMBIO_EUR = 5

export type TrabajoCompletado = {
  trabajoId: string
  terminadoEn: string
  riesgo: unknown
  ofertas: { producto: string; primaTotalSucesivos: number | null }[]
}

export type AlertaTarifa = {
  hash: string
  modalidad: string
  producto: string
  /** Para reconocer el edificio sin datos personales: «CP 41003 · 1.200 m²». */
  etiqueta: string
  antes: { trabajoId: string; fecha: string; prima: number }
  despues: { trabajoId: string; fecha: string; prima: number }
  diferencia: number
  porcentaje: number
}

const redondear2 = (n: number) => Math.round(n * 100) / 100

function etiquetaRiesgo(riesgo: unknown): string {
  const r = (riesgo ?? {}) as { direccion?: { codigoPostal?: unknown }; m2Construidos?: unknown }
  const partes: string[] = []
  if (typeof r.direccion?.codigoPostal === 'string') partes.push(`CP ${r.direccion.codigoPostal}`)
  if (typeof r.m2Construidos === 'number') partes.push(`${r.m2Construidos.toLocaleString('es-ES', { useGrouping: 'always' })} m²`)
  return partes.join(' · ') || 'riesgo sin CP'
}

/** ¿Cambio relevante? Más de un 1 % O más de 5 € (estricto). */
export function esCambioRelevante(antes: number, despues: number): boolean {
  const dif = Math.abs(redondear2(despues - antes))
  if (dif === 0) return false
  return dif > UMBRAL_CAMBIO_EUR || dif / antes > UMBRAL_CAMBIO_PCT
}

/**
 * Para trabajos `ok` con el MISMO riesgo normalizado y la misma modalidad (y producto), compara la
 * prima ANUAL (sucesivos) de cada cotización con la anterior que tenga dato. Un sucesivos `null` no se
 * compara (no es 0): se salta. Devuelve las alertas, la más reciente primero.
 */
export function detectarCambiosTarifa(trabajos: TrabajoCompletado[]): AlertaTarifa[] {
  type Obs = { trabajoId: string; fecha: string; prima: number; etiqueta: string }
  const grupos = new Map<string, { hash: string; modalidad: string; producto: string; obs: Obs[] }>()
  for (const t of trabajos) {
    const n = riesgoNormalizado(t.riesgo)
    const hash = hashRiesgo(t.riesgo)
    if (!n || !hash) continue
    const modalidad = String(n.modalidad)
    for (const o of t.ofertas) {
      const p = o.primaTotalSucesivos
      if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0) continue
      const producto = o.producto.trim().toLowerCase()
      const clave = `${hash}|${modalidad}|${producto}`
      let g = grupos.get(clave)
      if (!g) grupos.set(clave, (g = { hash, modalidad, producto: o.producto.trim(), obs: [] }))
      g.obs.push({ trabajoId: t.trabajoId, fecha: t.terminadoEn, prima: p, etiqueta: etiquetaRiesgo(t.riesgo) })
    }
  }
  const alertas: AlertaTarifa[] = []
  for (const g of grupos.values()) {
    const obs = g.obs.sort((a, b) => a.fecha.localeCompare(b.fecha))
    for (let i = 1; i < obs.length; i++) {
      const a = obs[i - 1]
      const b = obs[i]
      if (!esCambioRelevante(a.prima, b.prima)) continue
      const diferencia = redondear2(b.prima - a.prima)
      alertas.push({
        hash: g.hash, modalidad: g.modalidad, producto: g.producto, etiqueta: b.etiqueta,
        antes: { trabajoId: a.trabajoId, fecha: a.fecha, prima: a.prima },
        despues: { trabajoId: b.trabajoId, fecha: b.fecha, prima: b.prima },
        diferencia,
        porcentaje: Math.round((diferencia / a.prima) * 10_000) / 100,
      })
    }
  }
  return alertas.sort((x, y) => y.despues.fecha.localeCompare(x.despues.fecha))
}

// ─── Métricas ────────────────────────────────────────────────────────────────

export type TrabajoMetrica = {
  estado: string
  creadoEn: string
  iniciadoEn: string | null
  terminadoEn: string | null
  error: unknown
}

export type MetricasPeriodo = {
  dias: number
  total: number
  ok: number
  fallidos: number
  enCurso: number
  cancelados: number
  /** ok / (ok + fallidos). `null` = ninguno terminado (no es 0 %). */
  tasaExito: number | null
  /** Segundos medios de iniciado→terminado de los `ok`. `null` = no consta. */
  tiempoMedioSeg: number | null
}

export type FalloAgrupado = { paso: string; mensaje: string; veces: number; ultimo: string }

function metricasPeriodo(trabajos: TrabajoMetrica[], ahora: Date, dias: number): MetricasPeriodo {
  const desde = ahora.getTime() - dias * msDia
  const del = trabajos.filter((t) => Date.parse(t.creadoEn) >= desde)
  const ok = del.filter((t) => t.estado === 'ok')
  const fallidos = del.filter((t) => FALLIDOS.has(t.estado)).length
  const tiempos = ok
    .map((t) => (t.iniciadoEn && t.terminadoEn ? (Date.parse(t.terminadoEn) - Date.parse(t.iniciadoEn)) / 1000 : NaN))
    .filter((s) => Number.isFinite(s) && s >= 0)
  return {
    dias,
    total: del.length,
    ok: ok.length,
    fallidos,
    enCurso: del.filter((t) => EN_COLA.has(t.estado)).length,
    cancelados: del.filter((t) => t.estado === 'cancelado').length,
    tasaExito: ok.length + fallidos > 0 ? Math.round((ok.length / (ok.length + fallidos)) * 1000) / 10 : null,
    tiempoMedioSeg: tiempos.length ? Math.round(tiempos.reduce((s, x) => s + x, 0) / tiempos.length) : null,
  }
}

/** Paso del fallo: el que nombra el acompañante («…en el paso «login»…») o, si no, el tipo de error. */
export function pasoDelError(error: unknown): { paso: string; mensaje: string } | null {
  if (!error || typeof error !== 'object') return null
  const e = error as { tipo?: unknown; mensaje?: unknown }
  const mensaje = typeof e.mensaje === 'string' ? e.mensaje : ''
  const m = /paso «([^»]{1,40})»/.exec(mensaje)
  const paso = m ? m[1] : typeof e.tipo === 'string' && e.tipo ? e.tipo : 'desconocido'
  // Agrupar por la FORMA del mensaje: cifras y espacios fuera.
  const norm = mensaje.replace(/\d+([.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 160)
  return { paso, mensaje: norm || '(sin mensaje)' }
}

export function calcularMetricas(trabajos: TrabajoMetrica[], ahora: Date): {
  d7: MetricasPeriodo
  d30: MetricasPeriodo
  fallos: FalloAgrupado[]
} {
  const desde = ahora.getTime() - 30 * msDia
  const grupos = new Map<string, FalloAgrupado>()
  for (const t of trabajos) {
    if (Date.parse(t.creadoEn) < desde) continue
    if (!FALLIDOS.has(t.estado) && t.estado !== 'error_reintentable') continue
    const p = pasoDelError(t.error)
    if (!p) continue
    const clave = `${p.paso}|${p.mensaje}`
    const fecha = t.terminadoEn ?? t.creadoEn
    const g = grupos.get(clave)
    if (g) {
      g.veces++
      if (fecha > g.ultimo) g.ultimo = fecha
    } else grupos.set(clave, { paso: p.paso, mensaje: p.mensaje, veces: 1, ultimo: fecha })
  }
  return {
    d7: metricasPeriodo(trabajos, ahora, 7),
    d30: metricasPeriodo(trabajos, ahora, 30),
    fallos: [...grupos.values()].sort((a, b) => b.veces - a.veces || b.ultimo.localeCompare(a.ultimo)).slice(0, 15),
  }
}
