// VEHÍCULO CONFIRMADO (14/10/2026, Alberto: «usa el bot de Mapfre que ya tiene esa información»). PURO: ni BD, ni red.
//
// Mapfre NSEI busca por MATRÍCULA y su diálogo «Selección de vehículo» trae el vehículo de catálogo exacto: denominación
// comercial, CV, CC, nº de puertas y fecha de inicio. Cuando el bot de Mapfre confirma ese vehículo (una sola fila y con la
// matrícula del riesgo: lo comprueba guard.ts del worker), el resultado lleva este objeto, que después alimenta a los demás
// bots (fase siguiente: encadenado). Aquí: el tipo, su validación en el formulario de auto/moto, el parser de la fila de
// Mapfre y la elección de versión por estos datos (paso puro que usa Allianz).
//
// 🚨 SIN matrícula ni bastidor: este objeto se CONSERVA en la purga del riesgo (lista blanca, purga-riesgo.ts). Una clave
//    que no sea de las seis se rechaza (no se descarta en silencio) y la denominación no puede tener forma de dato personal.
// Tres estados: `null` = «no consta» (nunca 0). Puertas 0 es un DATO (Mapfre pinta 0 en las motos); CC 0 también (eléctrico).
// Elección de versión: SOLO si exactamente UNA candidata casa y todas las demás quedan DESCARTADAS por un dato que
// contradice; una candidata «sin datos» no se descarta (no se sabe) y deja la elección sin decidir. Nunca «la más parecida».

import { pareceDatoPersonalEnDescripcion } from './formulario-auto.ts'
import { esOpcionVacia, fechaIsoDesdeTexto, type CandidatoVersion, type EleccionVersion } from './vehiculo.ts'

export const ORIGENES_VEHICULO_CONFIRMADO = ['mapfre'] as const
export type OrigenVehiculoConfirmado = (typeof ORIGENES_VEHICULO_CONFIRMADO)[number]

export type VehiculoConfirmado = {
  origen: OrigenVehiculoConfirmado
  /** «Denominación comercial» del catálogo (marca + modelo + versión en un solo texto; Mapfre no los separa). */
  denominacion: string
  /** Potencia en CV (la columna «CV/KW» de Mapfre trae CV, confirmado por Alberto 14/10/2026). */
  cv: number | null
  /** Cilindrada en cc. */
  cc: number | null
  /** Nº de puertas (0 en una moto). */
  puertas: number | null
  /** Fecha de inicio del vehículo en el catálogo (ISO AAAA-MM-DD). */
  fechaInicio: string | null
}

/** Las ÚNICAS claves del objeto (la misma lista conserva la purga: `SUBCLAVES_RIESGO.vehiculoConfirmado`). */
export const CLAVES_VEHICULO_CONFIRMADO = ['origen', 'denominacion', 'cv', 'cc', 'puertas', 'fechaInicio'] as const
export const MAX_DENOMINACION_VEHICULO = 200

const espacios = (s: string) => s.replace(/\s+/g, ' ').trim()

export type ValidacionVehiculoConfirmado = { ok: true; valor: VehiculoConfirmado } | { ok: false; errores: string[] }

/**
 * Valida el `vehiculoConfirmado` del formulario. Nunca repite el valor en el error (la denominación podría traer, por error,
 * algo personal). Claves fuera de las seis (p. ej. `matricula`, `bastidor`) → error: el objeto se conserva tras la purga.
 */
export function validarVehiculoConfirmado(v: unknown): ValidacionVehiculoConfirmado {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, errores: ['vehiculoConfirmado: tiene que ser un objeto (o no venir)'] }
  const o = v as Record<string, unknown>
  const errores: string[] = []
  const extra = Object.keys(o).filter((k) => !(CLAVES_VEHICULO_CONFIRMADO as readonly string[]).includes(k))
  if (extra.length) errores.push(`vehiculoConfirmado: claves no permitidas (${extra.map((k) => k.slice(0, 30)).join(', ')}); solo ${CLAVES_VEHICULO_CONFIRMADO.join(', ')}`)
  const origen = typeof o.origen === 'string' && (ORIGENES_VEHICULO_CONFIRMADO as readonly string[]).includes(o.origen) ? (o.origen as OrigenVehiculoConfirmado) : null
  if (!origen) errores.push(`vehiculoConfirmado.origen: tiene que ser uno de ${ORIGENES_VEHICULO_CONFIRMADO.join(', ')}`)
  let denominacion: string | null = null
  if (typeof o.denominacion !== 'string' || espacios(o.denominacion) === '') errores.push('vehiculoConfirmado.denominacion: obligatoria')
  else if (espacios(o.denominacion).length > MAX_DENOMINACION_VEHICULO) errores.push(`vehiculoConfirmado.denominacion: máximo ${MAX_DENOMINACION_VEHICULO} caracteres`)
  else if (pareceDatoPersonalEnDescripcion(o.denominacion)) errores.push('vehiculoConfirmado.denominacion: solo el nombre de catálogo (sin matrícula, bastidor, NIF, email, teléfono ni IBAN)')
  else denominacion = espacios(o.denominacion)
  const entero = (k: 'cv' | 'cc' | 'puertas', min: number, max: number): number | null => {
    const x = o[k]
    if (x === undefined || x === null) return null
    if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) {
      errores.push(`vehiculoConfirmado.${k}: tiene que ser un entero entre ${min} y ${max} (o null si no consta)`)
      return null
    }
    return x
  }
  const cv = entero('cv', 1, 2000)
  const cc = entero('cc', 0, 10000)
  const puertas = entero('puertas', 0, 9)
  let fechaInicio: string | null = null
  if (o.fechaInicio !== undefined && o.fechaInicio !== null) {
    const f = typeof o.fechaInicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.fechaInicio) ? fechaIsoDesdeTexto(o.fechaInicio) : null
    if (f === null) errores.push('vehiculoConfirmado.fechaInicio: tiene que ser una fecha AAAA-MM-DD (o null si no consta)')
    else fechaInicio = f
  }
  if (errores.length || !origen || denominacion === null) return { ok: false, errores }
  return { ok: true, valor: { origen, denominacion, cv, cc, puertas, fechaInicio } }
}

/** Celdas de catálogo de UNA fila del diálogo «Selección de vehículo» de Mapfre (nunca matrícula ni bastidor). */
export type FilaCatalogoMapfre = { denominacion: string; cvKw: string; cc: string; puertas: string; fechaInicio: string }

/** «110», «110,00», «110.0» → 110; vacío, guion o basura → null (nunca 0 por defecto). */
function enteroDeCelda(t: string, max: number): number | null {
  const m = /^\s*(\d{1,5})(?:[.,]0{1,2})?\s*$/.exec(t)
  if (!m) return null
  const n = Number(m[1])
  return n <= max ? n : null
}

/**
 * Fila de Mapfre → `VehiculoConfirmado`. Denominación vacía → `null` (no hay vehículo). Cada número/fecha ilegible → `null`
 * («no consta»), nunca 0. CV: la columna «CV/KW» trae CV (Alberto); un decimal distinto de ,00 no se redondea (null).
 */
export function vehiculoConfirmadoDesdeMapfre(f: FilaCatalogoMapfre): VehiculoConfirmado | null {
  const denominacion = espacios(f.denominacion ?? '')
  if (denominacion === '' || esOpcionVacia(denominacion)) return null
  const cv = enteroDeCelda(f.cvKw ?? '', 2000)
  const r = validarVehiculoConfirmado({
    origen: 'mapfre',
    denominacion,
    cv: cv === 0 ? null : cv,
    cc: enteroDeCelda(f.cc ?? '', 10000),
    puertas: enteroDeCelda(f.puertas ?? '', 9),
    fechaInicio: fechaIsoDesdeTexto(f.fechaInicio ?? ''),
  })
  return r.ok ? r.valor : null
}

// ───────────────────────── elección de versión por el vehículo confirmado ─────────────────────────

/** Datos de catálogo de una candidata de versión de OTRA compañía. `null` = la candidata no lo dice. */
export type DatosVersionCatalogo = { cv: number | null; cc: number | null; puertas: number | null; fechaInicio: string | null }
export type CandidataConDatos = CandidatoVersion & { datos: DatosVersionCatalogo }

export type ResolucionPorVehiculoConfirmado =
  | { tipo: 'unica'; eleccion: EleccionVersion }
  | { tipo: 'sin_decidir'; motivo: 'sin_vehiculo' | 'sin_candidatas' | 'ninguna_casa' | 'varias_casan' | 'sin_datos' }

const ATRIBUTOS = ['cv', 'cc', 'puertas', 'fechaInicio'] as const

/**
 * ¿Casa una candidata con el vehículo confirmado? Se comparan SOLO los atributos que tienen los dos (igualdad exacta: sin
 * tolerancia, nada de «parecido»). `descartada` = algún atributo comparado difiere. `suficiente` = se comparó al menos CV o CC
 * (puertas o fecha solas no identifican una versión).
 */
function cotejar(vc: VehiculoConfirmado, d: DatosVersionCatalogo): { descartada: boolean; suficiente: boolean } {
  let descartada = false
  const comparados = new Set<string>()
  for (const a of ATRIBUTOS) {
    const x = vc[a]
    const y = d[a]
    if (x === null || y === null || y === undefined) continue
    comparados.add(a)
    if (x !== y) descartada = true
  }
  return { descartada, suficiente: comparados.has('cv') || comparados.has('cc') }
}

/**
 * Elige la versión de catálogo de otra compañía por el vehículo confirmado. `unica` SOLO si exactamente una candidata casa
 * (sin contradicción y con CV o CC comparados) y TODAS las demás quedan descartadas por un dato que contradice. Si alguna
 * otra no se puede descartar por falta de datos → `sin_datos`; si casan varias → `varias_casan`; si ninguna → `ninguna_casa`.
 * En todos esos casos el llamante sigue con su flujo de siempre (memoria / IA / persona). Opciones vacías y duplicadas fuera.
 */
export function eleccionPorVehiculoConfirmado(vc: VehiculoConfirmado | null | undefined, candidatas: readonly CandidataConDatos[]): ResolucionPorVehiculoConfirmado {
  if (!vc) return { tipo: 'sin_decidir', motivo: 'sin_vehiculo' }
  const vistas = new Set<string>()
  const limpias = candidatas.filter((c) => {
    const etiqueta = espacios(String(c?.etiqueta ?? ''))
    if (esOpcionVacia(etiqueta)) return false
    const k = `${c.codigo ?? ''}|${etiqueta.toUpperCase()}`
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
  if (limpias.length === 0) return { tipo: 'sin_decidir', motivo: 'sin_candidatas' }
  const casan: CandidataConDatos[] = []
  let dudosas = 0
  for (const c of limpias) {
    const r = cotejar(vc, c.datos)
    if (r.descartada) continue
    if (r.suficiente) casan.push(c)
    else dudosas++
  }
  if (casan.length > 1) return { tipo: 'sin_decidir', motivo: 'varias_casan' }
  if (dudosas > 0) return { tipo: 'sin_decidir', motivo: 'sin_datos' }
  if (casan.length === 0) return { tipo: 'sin_decidir', motivo: 'ninguna_casa' }
  const elegida = casan[0]!
  return { tipo: 'unica', eleccion: elegida.codigo ? { codigo: elegida.codigo, etiqueta: espacios(elegida.etiqueta) } : { codigo: null, etiqueta: espacios(elegida.etiqueta) } }
}

/**
 * Datos de catálogo LEÍDOS de la etiqueta de una versión («F 800 S 85 CV», «1.6 TDI 110CV 5P 1598 CC»). Solo cifras con su
 * UNIDAD explícita (CV, CC/CM3, P/PUERTAS); una unidad que aparece dos veces con valores distintos → `null`. kW no se
 * convierte (redondeos distintos entre compañías descartarían la versión buena). La fecha no viene en la etiqueta → `null`.
 */
export function datosDesdeEtiquetaVersion(etiqueta: string): DatosVersionCatalogo {
  const t = ` ${espacios(etiqueta).toUpperCase()} `
  const unico = (re: RegExp, max: number): number | null => {
    const valores = new Set([...t.matchAll(re)].map((m) => Number(m[1])))
    if (valores.size !== 1) return null
    const n = [...valores][0]!
    return Number.isInteger(n) && n >= 0 && n <= max ? n : null
  }
  const cv = unico(/(?<![\d.,])(\d{1,4})\s*(?:CV|C\.V\.)(?![A-Z0-9])/g, 2000)
  return {
    cv: cv === 0 ? null : cv,
    cc: unico(/(?<![\d.,])(\d{2,5})\s*(?:CC|C\.C\.|CM3)(?![A-Z0-9])/g, 10000),
    puertas: unico(/(?<![\d.,])([2-9])\s*(?:P|PUERTAS|PTAS)(?![A-Z0-9])/g, 9),
    fechaInicio: null,
  }
}

/**
 * Atajo para los portales cuyas versiones son solo etiqueta + código (Allianz): los datos salen de la etiqueta. Devuelve la
 * elección (código y etiqueta de la candidata) o `null` = sin decidir (sigue el flujo de siempre).
 */
export function eleccionPorVehiculoConfirmadoDeEtiquetas(vc: VehiculoConfirmado | null | undefined, versiones: readonly CandidatoVersion[]): EleccionVersion | null {
  const r = eleccionPorVehiculoConfirmado(vc, versiones.map((v) => ({ ...v, datos: datosDesdeEtiquetaVersion(v.etiqueta ?? '') })))
  return r.tipo === 'unica' ? r.eleccion : null
}
