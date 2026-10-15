// Formulario CANÓNICO de HOGAR (14/10/2026). PURO: ni BD, ni red, ni Playwright.
//
// Lo que un robot necesita para TARIFICAR una vivienda en un portal de compañía. Primera compañía: Allianz ePAC
// «Allianz HOGAR» (app Angular `ngx-allianzhogar…` en el iframe `appArea`; pantalla 1 «¿Quién es el tomador?» + «Datos de
// la vivienda», vista en 6 exploraciones IA del 13-14/10/2026). Cualquier otra compañía de Hogar valida con esto mismo.
//
// 🚨 Reglas de la casa:
//   · USO, RÉGIMEN y TIPO de vivienda deciden la tarifa: SIEMPRE explícitos, sin valor por defecto (el portal trae uno
//     marcado de serie y el robot lo cambia SIEMPRE al del formulario). Lo mismo «con/sin madera» (Allianz lo pregunta).
//   · Año de construcción y m²: OBLIGATORIOS (Allianz no avanza sin ellos). Los completa quien encola (Catastro, solo si es
//     inequívoco: `riesgo-oportunidad.ts`); aquí no se inventan.
//   · Tres estados: `null` = «no consta» (el robot no rellena nada en su lugar), nunca 0/'' por defecto.
//   · El documento y la fecha de nacimiento son datos PERSONALES: solo viven aquí y en su campo del portal; nunca en logs,
//     trazas ni mensajes de error (los errores nombran el campo, no el valor).
// Las rutas coinciden con el `riesgo` de la exploración (`tomador.*`, `inmueble.*`, `hogar.*`, `rutaRiesgo` del catálogo de
// `explorador.ts`); los VALORES de uso/régimen/tipo, no: aquí son claves canónicas en español, no ids de Codeoscopic.
import { esDniNie, normalizarDocumento } from './tomador.ts'
import { tieneCaracteresProhibidos } from './poblacion.ts'

/** USO de la vivienda (decide la tarifa). */
export const USOS_VIVIENDA = ['habitual', 'secundaria', 'alquiler', 'turistico'] as const
export type UsoVivienda = (typeof USOS_VIVIENDA)[number]
/** RÉGIMEN de quien asegura (decide la tarifa). */
export const REGIMENES_VIVIENDA = ['propietario', 'inquilino'] as const
export type RegimenVivienda = (typeof REGIMENES_VIVIENDA)[number]
/**
 * Tipo de vivienda. `planta_baja` = planta baja O piso con ventanas a menos de 3 m del suelo (así lo agrupa Allianz). Fuera a
 * propósito (no son viviendas que tarifiquemos hoy): trastero, plaza de garaje, caravana/casa móvil.
 */
export const TIPOS_VIVIENDA = ['piso', 'planta_baja', 'atico', 'adosada', 'independiente'] as const
export type TipoVivienda = (typeof TIPOS_VIVIENDA)[number]

export type TomadorHogar = {
  /** DNI/NIE normalizado (mayúsculas, sin espacios ni guiones), con la letra de control correcta. */
  documentoIdentidad: string
  /** ISO AAAA-MM-DD. */
  fechaNacimiento: string
}

export type InmuebleHogar = {
  /** 5 dígitos, provincia 01-52. */
  codigoPostal: string
  /** Población esperada del CP: si viene, el robot comprueba que el portal autocompleta ESA (si no, para). `null` = no consta. */
  municipio: string | null
  nombreVia: string
  /** Número de la vía (texto: «12», «12B», «s/n»…). */
  numero: string
  bloque: string | null
  escalera: string | null
  /** Planta/piso («2», «BJ»…). */
  planta: string | null
  puerta: string | null
  anioConstruccion: number
  /** `null` = no consta / sin reforma declarada. */
  anioReforma: number | null
  /** Superficie construida de la vivienda en m². */
  superficieM2: number
  /**
   * Referencia catastral (14 = parcela, 20 = bien), en mayúsculas y sin espacios. Opcional: `undefined` = no consta (Mapfre
   * Hogar la necesita; Allianz no). La consulta @central/core-catastro la resuelve ANTES de encolar; nunca la inventa el bot.
   */
  referenciaCatastral?: string
}

export type DatosHogar = {
  uso: UsoVivienda
  regimen: RegimenVivienda
  tipoVivienda: TipoVivienda
  /** ¿Construcción con madera? (Allianz: «Sin madera» / «Con madera»). Explícito: sin valor por defecto. */
  conMadera: boolean
  /** Capitales en euros (número). `null` = no consta: la pantalla de valoración de bienes no está mapeada todavía. */
  capitalContinenteEur: number | null
  capitalContenidoEur: number | null
}

export type FormularioHogar = {
  ramo: 'hogar'
  tomador: TomadorHogar
  inmueble: InmuebleHogar
  hogar: DatosHogar
}

export type ValidacionFormularioHogar = { ok: true; formulario: FormularioHogar } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function texto(v: unknown, campo: string, errores: string[], max: number, obligatorio: boolean): string | null {
  if (vacio(v)) {
    if (obligatorio) errores.push(`${campo}: obligatorio`)
    return null
  }
  if (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))) {
    errores.push(`${campo}: tiene que ser texto`)
    return null
  }
  const t = String(v).trim().replace(/\s+/g, ' ')
  if (t.length > max) { errores.push(`${campo}: más de ${max} caracteres`); return null }
  if (tieneCaracteresProhibidos(t)) { errores.push(`${campo}: caracteres no admitidos`); return null }
  return t
}

function enLista<T extends string>(v: unknown, lista: readonly T[], campo: string, errores: string[]): T | null {
  if (vacio(v)) { errores.push(`${campo}: obligatorio (sin valor por defecto: ${lista.join(', ')})`); return null }
  if (typeof v === 'string' && (lista as readonly string[]).includes(v)) return v as T
  errores.push(`${campo}: no es uno de ${lista.join(', ')}`)
  return null
}

function entero(v: unknown, campo: string, errores: string[], min: number, max: number, obligatorio: boolean): number | null {
  if (vacio(v)) {
    if (obligatorio) errores.push(`${campo}: obligatorio`)
    return null
  }
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isInteger(n) || n < min || n > max) { errores.push(`${campo}: tiene que ser un entero entre ${min} y ${max} (número, no texto)`); return null }
  return n
}

function importe(v: unknown, campo: string, errores: string[]): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) { errores.push(`${campo}: tiene que ser un importe en euros mayor que 0 (número, no texto)`); return null }
  return Math.round(n * 100) / 100
}

function fechaIsoReal(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return f.getUTCFullYear() === Number(m[1]) && f.getUTCMonth() === Number(m[2]) - 1 && f.getUTCDate() === Number(m[3])
}

/** AAAA-MM-DD → dd/mm/aaaa (como lo escriben los portales). Otra forma → `null` (no se adivina). */
export function fechaDdMmAaaaDeIso(iso: string): string | null {
  return fechaIsoReal(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null
}

/**
 * Riesgo crudo (de asegura) → `FormularioHogar`, todo o nada. Los errores nombran el CAMPO, nunca el valor (son datos
 * personales en el caso del tomador). `hoy` fija la edad del tomador y el año máximo de construcción/reforma.
 */
export function validarFormularioHogar(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioHogar {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['formulario: tiene que ser un objeto'] }
  const errores: string[] = []
  if (e.ramo !== 'hogar') errores.push('ramo: tiene que ser «hogar»')
  const anioHoy = hoy.getUTCFullYear()

  // ── tomador ──
  const t = obj(e.tomador)
  let tomador: TomadorHogar | null = null
  if (!t) errores.push('tomador: obligatorio (objeto con documentoIdentidad y fechaNacimiento)')
  else {
    let doc: string | null = null
    const docCrudo = texto(t.documentoIdentidad, 'tomador.documentoIdentidad', errores, 20, true)
    if (docCrudo !== null) {
      const d = normalizarDocumento(docCrudo)
      if (esDniNie(d)) doc = d
      else errores.push('tomador.documentoIdentidad: no es un DNI/NIE válido')
    }
    let fn: string | null = null
    const fnCruda = texto(t.fechaNacimiento, 'tomador.fechaNacimiento', errores, 10, true)
    if (fnCruda !== null) {
      if (!fechaIsoReal(fnCruda)) errores.push('tomador.fechaNacimiento: no es una fecha AAAA-MM-DD')
      else {
        const f = new Date(`${fnCruda}T00:00:00Z`)
        let edad = anioHoy - f.getUTCFullYear()
        if (hoy.getUTCMonth() < f.getUTCMonth() || (hoy.getUTCMonth() === f.getUTCMonth() && hoy.getUTCDate() < f.getUTCDate())) edad--
        if (edad < 18 || edad > 110) errores.push('tomador.fechaNacimiento: la edad resultante no es la de un tomador (18-110)')
        else fn = fnCruda
      }
    }
    if (doc !== null && fn !== null) tomador = { documentoIdentidad: doc, fechaNacimiento: fn }
  }

  // ── inmueble ──
  const i = obj(e.inmueble)
  let inmueble: InmuebleHogar | null = null
  if (!i) errores.push('inmueble: obligatorio')
  else {
    const n0 = errores.length
    let codigoPostal: string | null = null
    const cp = typeof i.codigoPostal === 'string' ? i.codigoPostal.trim() : null
    if (cp === null || cp === '') errores.push('inmueble.codigoPostal: obligatorio')
    else if (!/^\d{5}$/.test(cp) || Number(cp.slice(0, 2)) < 1 || Number(cp.slice(0, 2)) > 52) errores.push('inmueble.codigoPostal: no es un código postal español de 5 dígitos')
    else codigoPostal = cp
    const municipio = texto(i.municipio, 'inmueble.municipio', errores, 80, false)
    const nombreVia = texto(i.nombreVia, 'inmueble.nombreVia', errores, 80, true)
    const numero = texto(i.numero, 'inmueble.numero', errores, 10, true)
    const bloque = texto(i.bloque, 'inmueble.bloque', errores, 10, false)
    const escalera = texto(i.escalera, 'inmueble.escalera', errores, 10, false)
    const planta = texto(i.planta, 'inmueble.planta', errores, 10, false)
    const puerta = texto(i.puerta, 'inmueble.puerta', errores, 10, false)
    const anioConstruccion = entero(i.anioConstruccion, 'inmueble.anioConstruccion', errores, 1500, anioHoy, true)
    const anioReforma = entero(i.anioReforma, 'inmueble.anioReforma', errores, 1500, anioHoy, false)
    if (anioConstruccion !== null && anioReforma !== null && anioReforma < anioConstruccion) errores.push('inmueble.anioReforma: anterior al año de construcción')
    const rcCruda = texto(i.referenciaCatastral, 'inmueble.referenciaCatastral', errores, 24, false)
    const rc = rcCruda === null ? null : rcCruda.replace(/[\s-]/g, '').toUpperCase()
    if (rc !== null && !/^[0-9A-Z]{14}(?:[0-9A-Z]{4}[A-Z]{2})?$/.test(rc)) errores.push('inmueble.referenciaCatastral: no es una referencia catastral (14 o 20 caracteres)')
    const superficieM2 = entero(i.superficieM2, 'inmueble.superficieM2', errores, 10, 100_000, true)
    if (errores.length === n0 && codigoPostal !== null && nombreVia !== null && numero !== null && anioConstruccion !== null && superficieM2 !== null) {
      inmueble = { codigoPostal, municipio, nombreVia, numero, bloque, escalera, planta, puerta, anioConstruccion, anioReforma, superficieM2, ...(rc !== null ? { referenciaCatastral: rc } : {}) }
    }
  }

  // ── hogar ──
  const h = obj(e.hogar)
  let hogar: DatosHogar | null = null
  if (!h) errores.push('hogar: obligatorio (uso, regimen, tipoVivienda, conMadera)')
  else {
    const n0 = errores.length
    const uso = enLista(h.uso, USOS_VIVIENDA, 'hogar.uso', errores)
    const regimen = enLista(h.regimen, REGIMENES_VIVIENDA, 'hogar.regimen', errores)
    const tipoVivienda = enLista(h.tipoVivienda, TIPOS_VIVIENDA, 'hogar.tipoVivienda', errores)
    const conMadera = typeof h.conMadera === 'boolean' ? h.conMadera : null
    if (conMadera === null) errores.push('hogar.conMadera: obligatorio (true o false, sin valor por defecto)')
    const capitalContinenteEur = importe(h.capitalContinenteEur, 'hogar.capitalContinenteEur', errores)
    const capitalContenidoEur = importe(h.capitalContenidoEur, 'hogar.capitalContenidoEur', errores)
    if (errores.length === n0 && uso && regimen && tipoVivienda && conMadera !== null) {
      hogar = { uso, regimen, tipoVivienda, conMadera, capitalContinenteEur, capitalContenidoEur }
    }
  }

  if (errores.length || !tomador || !inmueble || !hogar) return { ok: false, errores: errores.length ? errores : ['formulario: incompleto'] }
  return { ok: true, formulario: { ramo: 'hogar', tomador, inmueble, hogar } }
}
