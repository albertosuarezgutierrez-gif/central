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
// Elección de versión (Alberto, 14/10/2026): Mapfre saca el vehículo EXACTO; en Allianz y los demás bots NO hace falta
// coincidencia exacta: se elige la versión «prácticamente la misma» (CV ±10 %, CC ±5 %; entre versiones casi iguales no hay
// diferencia relevante para el precio). Se puntúa por cercanía y gana la mejor dentro de tolerancia; empate → la primera.
// Fuera de tolerancia o sin CV/CC legibles → no elige (flujo de siempre: memoria / IA / persona). Una elección explícita
// de persona o IA siempre manda sobre esta (lo decide el llamante).

import { pareceDatoPersonalEnDescripcion, type FormularioAuto } from './formulario-auto.ts'
import { COMBUSTIBLES, esOpcionVacia, fechaIsoDesdeTexto, type Combustible, type CandidatoVersion, type EleccionVersion } from './vehiculo.ts'

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
  /** Combustible (Mapfre lo da en el resumen tras confirmar la fila). Ausente o `null` = «no consta»: nunca descarta una candidata. */
  combustible?: Combustible | null
}

/** Las ÚNICAS claves del objeto (la misma lista conserva la purga: `SUBCLAVES_RIESGO.vehiculoConfirmado`). */
export const CLAVES_VEHICULO_CONFIRMADO = ['origen', 'denominacion', 'cv', 'cc', 'puertas', 'fechaInicio', 'combustible'] as const
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
  let combustible: Combustible | null = null
  if (o.combustible !== undefined && o.combustible !== null) {
    if (typeof o.combustible === 'string' && (COMBUSTIBLES as readonly string[]).includes(o.combustible)) combustible = o.combustible as Combustible
    else errores.push(`vehiculoConfirmado.combustible: tiene que ser uno de ${COMBUSTIBLES.join(', ')} (o null si no consta)`)
  }
  if (errores.length || !origen || denominacion === null) return { ok: false, errores }
  // `combustible` solo aparece si consta: un objeto sin él es idéntico al de antes (y a lo ya guardado).
  return { ok: true, valor: { origen, denominacion, cv, cc, puertas, fechaInicio, ...(combustible ? { combustible } : {}) } }
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
export type DatosVersionCatalogo = {
  cv: number | null
  cc: number | null
  puertas: number | null
  fechaInicio: string | null
  /** Opcionales: ausente o `null` = la candidata no lo dice (no descarta). */
  combustible?: Combustible | null
  /** Años de comercialización de la candidata (rango abierto por un lado si solo trae uno). */
  anioDesde?: number | null
  anioHasta?: number | null
  /** Potencia en kW tal como la escribe la etiqueta (Allianz: «Potencia (kW) 163»). Solo para comparar candidatas ENTRE SÍ (la unidad del portal no es fiable frente a Mapfre). */
  kw?: number | null
}
export type CandidataConDatos = CandidatoVersion & { datos: DatosVersionCatalogo }

export type ResolucionPorVehiculoConfirmado =
  /** `porSimilitud: true` = la versión se eligió «por similitud con Mapfre» (traza; sin datos personales). */
  | { tipo: 'unica'; porSimilitud: true; eleccion: EleccionVersion }
  | { tipo: 'sin_decidir'; motivo: 'sin_vehiculo' | 'sin_candidatas' | 'fuera_de_tolerancia' | 'sin_datos' }

/** Tolerancia relativa respecto al valor de Mapfre: CV ±10 %, CC ±5 %. */
export const TOLERANCIA_CV = 0.1
export const TOLERANCIA_CC = 0.05
/** Texto de traza de una versión elegida por similitud (aviso del resultado). */
export const AVISO_VERSION_POR_SIMILITUD = 'Versión elegida por similitud con el vehículo confirmado en Mapfre (CV ±10 %, CC ±5 %), no por coincidencia exacta.'

/** Lo que se sabe del riesgo para filtrar candidatas (todo opcional: `null`/ausente = no consta). `VehiculoConfirmado` encaja. */
export type ReferenciaRiesgo = {
  cv?: number | null
  cc?: number | null
  puertas?: number | null
  combustible?: Combustible | null
  /** Fecha de inicio del vehículo en el catálogo (Mapfre): se compara con el rango de años de la candidata. */
  fechaInicio?: string | null
  /** 1ª matriculación del riesgo (ISO): filtra por rango de años y desempata «la comercialización más cercana (≤)». */
  fechaMatriculacion?: string | null
}

const EPS = 1e-9
/** Holgura (años) al comprobar la fecha de inicio de Mapfre contra el rango de la candidata. */
export const HOLGURA_ANIOS = 1

/** Distancia relativa normalizada por su tolerancia (0 = igual; ≤1 = dentro); `null` = fuera de tolerancia. */
function distanciaRelativa(base: number, otro: number, tol: number): number | null {
  if (base === 0) return otro === 0 ? 0 : null
  const d = Math.abs(otro - base) / base
  return d <= tol + EPS ? d / tol : null
}

/** Palabras de la denominación de Mapfre presentes en la etiqueta (desempate). */
function palabrasEnComun(denominacion: string, etiqueta: string): number {
  const trocear = (t: string) => t.toUpperCase().split(/[^A-Z0-9ÁÉÍÓÚÜÑ]+/).filter((w) => w.length >= 2)
  const e = new Set(trocear(etiqueta))
  return [...new Set(trocear(denominacion))].filter((w) => e.has(w)).length
}

/** ¿El año de `fechaInicio` cae en [desde, hasta] con `HOLGURA_ANIOS` de holgura? Sin fecha o sin ninguna cota → true (no se sabe). */
export function anioEnRango(fechaInicio: string | null | undefined, desde: number | null | undefined, hasta: number | null | undefined): boolean {
  const m = typeof fechaInicio === 'string' ? /^(\d{4})-\d{2}-\d{2}$/.exec(fechaInicio) : null
  if (!m) return true
  const anio = Number(m[1])
  if (typeof desde === 'number' && anio < desde - HOLGURA_ANIOS) return false
  if (typeof hasta === 'number' && anio > hasta + HOLGURA_ANIOS) return false
  return true
}

/**
 * Puntúa una candidata frente al vehículo de Mapfre. `null` = no elegible: sin ningún CV/CC comparable (no se sabe), fuera de
 * tolerancia en alguno, o con puertas que contradicen (ambas lo traen y difieren). `distancia` = media de las distancias
 * normalizadas de CV y CC comparados (0 = exacta).
 */
function puntuar(vc: ReferenciaRiesgo, d: DatosVersionCatalogo): { distancia: number } | { motivo: 'sin_datos' | 'fuera_de_tolerancia' } {
  const partes: number[] = []
  let fuera = false
  for (const [a, tol] of [['cv', TOLERANCIA_CV], ['cc', TOLERANCIA_CC]] as const) {
    const x = vc[a]
    const y = d[a]
    if (typeof x !== 'number' || y === null || y === undefined) continue
    const r = distanciaRelativa(x, y, tol)
    if (r === null) fuera = true
    else partes.push(r)
  }
  if (typeof vc.puertas === 'number' && d.puertas !== null && d.puertas !== undefined && vc.puertas !== d.puertas) fuera = true
  // Combustible exacto (Alberto, 19/10/2026) cuando AMBOS lo traen; si uno no consta, no descarta.
  if (vc.combustible && d.combustible && vc.combustible !== d.combustible) fuera = true
  // Años: la fecha de inicio de Mapfre tiene que caer en el rango de la candidata (±1 año). Sin fecha o sin rango, no descarta.
  if (!anioEnRango(vc.fechaInicio ?? vc.fechaMatriculacion, d.anioDesde, d.anioHasta)) fuera = true
  if (fuera) return { motivo: 'fuera_de_tolerancia' }
  if (partes.length === 0) return { motivo: 'sin_datos' }
  return { distancia: partes.reduce((a, b) => a + b, 0) / partes.length }
}

/**
 * Elige la versión de catálogo de otra compañía por SIMILITUD con el vehículo confirmado: la de menor distancia (CV y CC con
 * tolerancia relativa) dentro de tolerancia; empate → más palabras de la denominación en la etiqueta; empate → la primera de
 * la lista. Sin vehículo / sin candidatas / sin CV o CC legibles (`sin_datos`) / ninguna en tolerancia (`fuera_de_tolerancia`)
 * → `sin_decidir` y el llamante sigue con su flujo de siempre (memoria / IA / persona). Opciones vacías y duplicadas fuera.
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
  let mejor: { c: CandidataConDatos; distancia: number; palabras: number } | null = null
  let hayFuera = false
  for (const c of limpias) {
    const r = puntuar(vc, c.datos)
    if ('motivo' in r) {
      if (r.motivo === 'fuera_de_tolerancia') hayFuera = true
      continue
    }
    const palabras = palabrasEnComun(vc.denominacion, c.etiqueta)
    if (!mejor || r.distancia < mejor.distancia - EPS || (Math.abs(r.distancia - mejor.distancia) <= EPS && palabras > mejor.palabras)) {
      mejor = { c, distancia: r.distancia, palabras }
    }
  }
  if (!mejor) return { tipo: 'sin_decidir', motivo: hayFuera ? 'fuera_de_tolerancia' : 'sin_datos' }
  const e = mejor.c
  return { tipo: 'unica', porSimilitud: true, eleccion: e.codigo ? { codigo: e.codigo, etiqueta: espacios(e.etiqueta) } : { codigo: null, etiqueta: espacios(e.etiqueta) } }
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
 * elección POR SIMILITUD (código y etiqueta de la candidata) o `null` = sin decidir (sigue el flujo de siempre).
 */
export function eleccionPorVehiculoConfirmadoDeEtiquetas(vc: VehiculoConfirmado | null | undefined, versiones: readonly CandidatoVersion[]): EleccionVersion | null {
  const r = eleccionPorVehiculoConfirmado(vc, versiones.map((v) => ({ ...v, datos: datosDesdeEtiquetaVersion(v.etiqueta ?? '') })))
  return r.tipo === 'unica' ? r.eleccion : null
}

// ───────────────────────── elección AUTOMÁTICA de versión por EQUIVALENCIA (19/10/2026) ─────────────────────────
// Alberto (dueño), 19/10/2026: la versión se elige SOLA; las diferencias entre acabados (GL/GLS/Full…) no influyen en tarificar y
// el cliente lo revisa en la emisión. Solo se PREGUNTA si las candidatas difieren de forma MATERIAL (combustible distinto, o CV/cc
// fuera de tolerancia entre ellas). Regla común de Mapfre (auto/moto), Allianz (Turismos/Moto) y Generali. PURA.
//   0. Elección de la bandeja (código o etiqueta exacta) que casa con UNA → esa, exacta. Que no case → se pregunta de nuevo.
//   1. Una sola candidata → esa (dato, sin supuesto).
//   2. Se filtran las compatibles con el riesgo (`puntuar`: CV ±10 %, cc ±5 %, combustible exacto si ambos lo traen, puertas, rango
//      de años). Lo que el riesgo o la candidata no dicen no descarta. Ninguna compatible → se pregunta.
//   3. Las compatibles son EQUIVALENTES si, respecto a la primera, comparten combustible y CV/kW/cc dentro de tolerancia (solo lo
//      que ambas traen). Equivalentes → se elige la de fecha de inicio más cercana (≤) a la matriculación; sin fechas, la primera
//      del portal; y se DECLARA (`supuesto`). Una difiere materialmente → se pregunta con TODAS.

export type CandidataEquivalencia = { etiqueta: string; codigo?: string | null; datos?: DatosVersionCatalogo | null }

export type ResolucionAutomaticaVersion =
  /** `indice` = posición en la lista ORIGINAL que se pasó. */
  | { tipo: 'bandeja'; indice: number; eleccion: EleccionVersion; supuesto: null }
  | { tipo: 'unica'; indice: number; eleccion: EleccionVersion; supuesto: null }
  | { tipo: 'automatica'; indice: number; eleccion: EleccionVersion; supuesto: string; equivalentes: number }
  | { tipo: 'preguntar'; motivo: 'material' | 'sin_compatibles' | 'eleccion_no_casa'; opciones: CandidatoVersion[] }
  | { tipo: 'ninguna' }

/** Texto del supuesto de una versión elegida sola (va en el aviso «Precio con supuestos: …»; sin comas dentro de la etiqueta). */
export function supuestoVersionAutomatica(etiqueta: string, equivalentes: number): string {
  return `Versión elegida automáticamente: ${espacios(etiqueta).replace(/,/g, ' ').replace(/\s+/g, ' ')} (había ${equivalentes} ${equivalentes === 1 ? 'equivalente' : 'equivalentes'}; revisar en la emisión)`
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Datos de catálogo leídos de la etiqueta para comparar candidatas (Allianz/Generali): lo de `datosDesdeEtiquetaVersion` (CV, cc,
 * puertas con unidad explícita) más kW («Potencia (kW) 163», «120 kW») y combustible SI el texto lo dice (gasolina, diésel,
 * eléctrico, híbrido…). Sin nada que parsear → todo `null` (no es influyente: se trata como equivalente). kW no se convierte.
 */
export function datosEquivalenciaDesdeEtiqueta(etiqueta: string): DatosVersionCatalogo {
  const base = datosDesdeEtiquetaVersion(etiqueta)
  const t = ` ${sinTildes(espacios(etiqueta)).toUpperCase()} `
  const kws = new Set<number>()
  for (const re of [/(?<![\d.,])(\d{2,4})\s*KW(?![A-Z0-9])/g, /KW\)?\s*[:=]?\s*(\d{2,4})(?![\d.,A-Z])/g]) for (const m of t.matchAll(re)) kws.add(Number(m[1]))
  const kw = kws.size === 1 ? [...kws][0]! : null
  let combustible: Combustible | null = null
  if (/ENCHUF|PLUG-?IN|PHEV/.test(t)) combustible = 'hibrido_enchufable'
  else if (/HIBRID|HYBRID/.test(t) || (/ELECTRIC/.test(t) && /GASOLINA|DIESEL|GASOIL|GASOLEO/.test(t))) combustible = 'hibrido'
  else if (/ELECTRIC/.test(t)) combustible = 'electrico'
  else if (/DIESEL|GASOIL|GASOLEO/.test(t)) combustible = 'diesel'
  else if (/GASOLINA|PETROL/.test(t)) combustible = 'gasolina'
  return { ...base, kw: kw !== null && kw > 0 ? kw : null, combustible }
}

/** Referencia del riesgo para filtrar y desempatar: vehículo confirmado + cilindrada de `seleccionVehiculo` + 1ª matriculación. PURA. */
export function referenciaRiesgoVersion(f: Pick<FormularioAuto, 'vehiculoConfirmado' | 'seleccionVehiculo' | 'fechaMatriculacion'> | null | undefined): ReferenciaRiesgo {
  const vc = f?.vehiculoConfirmado ?? null
  const ccSel = typeof f?.seleccionVehiculo?.cilindradaCc === 'number' ? f.seleccionVehiculo.cilindradaCc : null
  return {
    cv: vc?.cv ?? null,
    cc: vc?.cc ?? ccSel,
    puertas: vc?.puertas ?? null,
    combustible: vc?.combustible ?? null,
    fechaInicio: vc?.fechaInicio ?? null,
    fechaMatriculacion: typeof f?.fechaMatriculacion === 'string' && fechaIsoDesdeTexto(f.fechaMatriculacion) ? f.fechaMatriculacion : null,
  }
}

/** ¿`b` es equivalente a la referencia `a`? Mismo combustible (si ambas lo traen) y CV/kW/cc dentro de tolerancia (solo lo que ambas traen). */
function equivalentePara(a: DatosVersionCatalogo, b: DatosVersionCatalogo): boolean {
  if (a.combustible && b.combustible && a.combustible !== b.combustible) return false
  for (const [k, tol] of [['cv', TOLERANCIA_CV], ['kw', TOLERANCIA_CV], ['cc', TOLERANCIA_CC]] as const) {
    const x = a[k]
    const y = b[k]
    if (typeof x !== 'number' || typeof y !== 'number') continue
    if (distanciaRelativa(x, y, tol) === null) return false
  }
  return true
}

const DATOS_VACIOS: DatosVersionCatalogo = { cv: null, cc: null, puertas: null, fechaInicio: null }

/**
 * Elige la versión SOLA cuando las candidatas son equivalentes; pregunta solo si difieren de forma material (ver arriba). PURA y
 * determinista. `eleccion` = la de la bandeja (explícita): manda y se usa exacta.
 */
export function elegirVersionAutomaticamente(
  candidatas: readonly CandidataEquivalencia[],
  opciones: { riesgo?: ReferenciaRiesgo | null; eleccion?: EleccionVersion | null } = {},
): ResolucionAutomaticaVersion {
  const vistas = new Set<string>()
  const limpias: Array<{ i: number; etiqueta: string; codigo: string | null; datos: DatosVersionCatalogo }> = []
  candidatas.forEach((c, i) => {
    const etiqueta = espacios(String(c?.etiqueta ?? ''))
    if (esOpcionVacia(etiqueta)) return
    const codigo = c.codigo == null || String(c.codigo).trim() === '' ? null : String(c.codigo).trim()
    const k = `${codigo ?? ''}|${etiqueta.toUpperCase()}`
    if (vistas.has(k)) return
    vistas.add(k)
    limpias.push({ i, etiqueta, codigo, datos: c.datos ?? DATOS_VACIOS })
  })
  if (limpias.length === 0) return { tipo: 'ninguna' }
  const todas = (): CandidatoVersion[] => limpias.map((l) => ({ etiqueta: l.etiqueta, codigo: l.codigo }))
  const elegida = (l: (typeof limpias)[number]): EleccionVersion => ({ codigo: l.codigo, etiqueta: l.etiqueta })
  const clave = (t: string) => sinTildes(espacios(t)).toUpperCase()

  // 0. Elección de la bandeja: exacta (código idéntico, o etiqueta igual salvo mayúsculas/tildes/espacios). Si no casa con UNA, se pregunta.
  const cod = opciones.eleccion?.codigo?.trim() || null
  const eti = opciones.eleccion?.etiqueta?.trim() ? clave(opciones.eleccion.etiqueta) : null
  if (cod || eti) {
    const casan = limpias.filter((l) => (cod !== null ? l.codigo === cod : clave(l.etiqueta) === eti))
    if (casan.length === 1) return { tipo: 'bandeja', indice: casan[0]!.i, eleccion: elegida(casan[0]!), supuesto: null }
    return { tipo: 'preguntar', motivo: 'eleccion_no_casa', opciones: todas() }
  }
  if (limpias.length === 1) return { tipo: 'unica', indice: limpias[0]!.i, eleccion: elegida(limpias[0]!), supuesto: null }

  // 1. Compatibles con el riesgo (lo que no se sabe no descarta).
  const riesgo = opciones.riesgo ?? {}
  const compatibles = limpias.filter((l) => {
    const r = puntuar(riesgo, l.datos)
    return !('motivo' in r && r.motivo === 'fuera_de_tolerancia')
  })
  if (compatibles.length === 0) return { tipo: 'preguntar', motivo: 'sin_compatibles', opciones: todas() }

  // 2. Equivalentes entre sí (respecto a la primera del portal); una distinta de forma material → se pregunta con todas.
  const primera = compatibles[0]!
  if (!compatibles.every((l) => equivalentePara(primera.datos, l.datos))) return { tipo: 'preguntar', motivo: 'material', opciones: todas() }

  // 3. Determinista: fecha de inicio más cercana (≤) a la matriculación; si no hay fechas utilizables, la primera del portal.
  let ganadora = primera
  const mat = riesgo.fechaMatriculacion ?? null
  if (mat) {
    let mejor: string | null = null
    for (const l of compatibles) {
      const f = l.datos.fechaInicio ?? null
      if (f && f <= mat && (mejor === null || f > mejor)) {
        mejor = f
        ganadora = l
      }
    }
  }
  return { tipo: 'automatica', indice: ganadora.i, eleccion: elegida(ganadora), supuesto: supuestoVersionAutomatica(ganadora.etiqueta, compatibles.length), equivalentes: compatibles.length }
}
