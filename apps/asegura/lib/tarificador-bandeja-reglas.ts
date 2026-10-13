// Bandeja «Necesita tu atención» del tarificador RPA (08/10/2026) — lo PURO: proyección de filas a lo que ve
// plataforma. Sin BD ni red (`node --test`). Las reglas de estado y el motivo legible viven en
// `@central/module-tarificacion` (`bandeja.ts`).
//
// 🛡️ Lista blanca: id, compañía, ramo, estado, tipo de error, motivo legible, fechas, intentos, versión del bot y
//    enlace a la oportunidad. NUNCA el mensaje técnico crudo, la URL del portal, el riesgo, el HTML/captura ni nada
//    del cliente.

import { decidirAccionBandeja, MAX_ELECCION_POBLACION, motivoLegible, validarOpcionesPoblacion, validarOpcionesVersion, type CandidatoVersion, type OpcionPoblacion, type PasoTraza } from '@central/module-tarificacion'

export const BANDEJA_LIMITE_POR_DEFECTO = 50
export const BANDEJA_LIMITE_MAXIMO = 100

export type FilaBandeja = {
  id: string
  compania: string
  ramo: string
  estado: string
  intentos: number
  error: unknown
  oportunidad_id: string | null
  bot_version: string | null
  fecha: Date | string
}

export type ItemBandeja = {
  id: string
  compania: string
  ramo: string
  estado: string
  tipoError: string | null
  motivo: string
  fecha: string
  intentos: number
  botVersion: string | null
  oportunidadId: string | null
  puedeReintentar: boolean
  puedeCancelar: boolean
  /** Versiones de catálogo para elegir a mano (13/10/2026). `null` = el trabajo no pide versión o no guardó la lista. */
  opcionesVersion: CandidatoVersion[] | null
  /** Poblaciones del CP para elegir a mano (13/10/2026). `null` = el trabajo no pide población o no guardó la lista. */
  opcionesPoblacion: OpcionPoblacion[] | null
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : new Date(d).toISOString())

export function tipoDeError(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return null
  const t = (error as Record<string, unknown>).tipo
  return typeof t === 'string' && t ? t.slice(0, 30) : null
}

export function proyectarItemBandeja(f: FilaBandeja): ItemBandeja {
  const tipo = tipoDeError(f.error)
  return {
    id: f.id,
    compania: f.compania,
    ramo: f.ramo,
    estado: f.estado,
    tipoError: tipo,
    motivo: motivoLegible(f.error, f.estado),
    fecha: iso(f.fecha),
    intentos: f.intentos,
    botVersion: f.bot_version,
    oportunidadId: f.oportunidad_id,
    puedeReintentar: decidirAccionBandeja('reintentar', f.estado, tipo).ok,
    puedeCancelar: decidirAccionBandeja('cancelar', f.estado, tipo).ok,
    opcionesVersion: opcionesVersionDelError(f.error),
    opcionesPoblacion: opcionesPoblacionDelError(f.error),
  }
}

/** La lista de versiones que guardó el fallo del trabajo (`error.opcionesVersion`), o `null`. Solo catálogo. */
export function opcionesVersionDelError(error: unknown): CandidatoVersion[] | null {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return null
  return validarOpcionesVersion((error as Record<string, unknown>).opcionesVersion)
}

// ─── Reintentar con la versión elegida a mano (13/10/2026) ───────────────────

export type EleccionBandeja = { codigo: string; etiqueta: string | null }

/** Forma de `eleccionVersion` en el cuerpo: ausente → `null`; `{ codigo, etiqueta? }` → elección; otra cosa → error. */
export function leerEleccionBandeja(v: unknown): { ok: true; eleccion: EleccionBandeja | null } | { ok: false; mensaje: string } {
  if (v === undefined || v === null) return { ok: true, eleccion: null }
  if (typeof v !== 'object' || Array.isArray(v)) return { ok: false, mensaje: 'eleccionVersion tiene que ser { codigo, etiqueta? }' }
  const o = v as Record<string, unknown>
  if (typeof o.codigo !== 'string' || !o.codigo.trim() || o.codigo.length > 60) return { ok: false, mensaje: 'eleccionVersion.codigo: obligatorio (código de la lista, máx. 60)' }
  if (o.etiqueta !== undefined && o.etiqueta !== null && (typeof o.etiqueta !== 'string' || o.etiqueta.length > 200)) {
    return { ok: false, mensaje: 'eleccionVersion.etiqueta: texto de máx. 200 (o no venga)' }
  }
  const etiqueta = typeof o.etiqueta === 'string' && o.etiqueta.trim() ? o.etiqueta : null
  return { ok: true, eleccion: { codigo: o.codigo.trim(), etiqueta } }
}

const claveEtiqueta = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleUpperCase('es')

/**
 * La elección TIENE que ser un código de la lista que guardó el fallo del trabajo. Si trae etiqueta, debe ser la de ese
 * código (salvo mayúsculas/espacios). Lo que se escribe en el riesgo es el código y la etiqueta DE LA LISTA.
 */
export function eleccionContraLista(e: EleccionBandeja, error: unknown): { ok: true; eleccion: { codigo: string; etiqueta: string } } | { ok: false; motivo: string } {
  const lista = opcionesVersionDelError(error)
  if (!lista) return { ok: false, motivo: 'el trabajo no guarda una lista de versiones: reintenta sin eleccionVersion' }
  const casan = lista.filter((o) => o.codigo === e.codigo)
  if (casan.length !== 1) return { ok: false, motivo: casan.length ? 'código repetido en la lista del trabajo' : 'eleccionVersion.codigo no está en la lista del trabajo' }
  if (e.etiqueta !== null && claveEtiqueta(e.etiqueta) !== claveEtiqueta(casan[0].etiqueta)) return { ok: false, motivo: 'eleccionVersion.etiqueta no es la de ese código' }
  return { ok: true, eleccion: { codigo: casan[0].codigo!, etiqueta: casan[0].etiqueta } }
}

// ─── Reintentar con la población elegida a mano (13/10/2026) ─────────────────
// Un CP con varias poblaciones: la elige una PERSONA de la lista que guardó el fallo (`error.opcionesPoblacion`). La IA
// no elige poblaciones (no hay base para adivinar). Se escribe en `riesgo.eleccionPoblacion` = texto EXACTO de la celda.

/** La lista de poblaciones que guardó el fallo del trabajo (`error.opcionesPoblacion`), o `null`. */
export function opcionesPoblacionDelError(error: unknown): OpcionPoblacion[] | null {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return null
  return validarOpcionesPoblacion((error as Record<string, unknown>).opcionesPoblacion)
}

/** Forma de `eleccionPoblacion` en el cuerpo: ausente → `null`; texto (≤120) → elección; otra cosa → error. */
export function leerEleccionPoblacionBandeja(v: unknown): { ok: true; eleccion: string | null } | { ok: false; mensaje: string } {
  if (v === undefined || v === null) return { ok: true, eleccion: null }
  if (typeof v !== 'string' || !v.trim() || v.length > MAX_ELECCION_POBLACION) {
    return { ok: false, mensaje: `eleccionPoblacion: texto de la lista del trabajo (máx. ${MAX_ELECCION_POBLACION}) o que no venga` }
  }
  return { ok: true, eleccion: v.replace(/\s+/g, ' ').trim() }
}

/** La elección TIENE que ser el `codigo` de UNA opción de la lista guardada. Lo que se escribe es el código DE LA LISTA. */
export function eleccionPoblacionContraLista(eleccion: string, error: unknown): { ok: true; eleccion: string } | { ok: false; motivo: string } {
  const lista = opcionesPoblacionDelError(error)
  if (!lista) return { ok: false, motivo: 'el trabajo no guarda una lista de poblaciones: reintenta sin eleccionPoblacion' }
  const casan = lista.filter((o) => o.codigo === eleccion)
  if (casan.length !== 1) return { ok: false, motivo: casan.length ? 'población repetida en la lista del trabajo' : 'eleccionPoblacion no está en la lista del trabajo' }
  return { ok: true, eleccion: casan[0].codigo }
}

/** `limite`: entero 1..BANDEJA_LIMITE_MAXIMO (por defecto 50). `desde`: entero ≥ 0. Basura → valores por defecto. */
export function leerPaginacion(limite: string | null, desde: string | null): { limite: number; desde: number } {
  const l = Number(limite ?? '')
  const d = Number(desde ?? '')
  return {
    limite: Number.isInteger(l) && l >= 1 && l <= BANDEJA_LIMITE_MAXIMO ? l : BANDEJA_LIMITE_POR_DEFECTO,
    desde: Number.isInteger(d) && d >= 0 && d <= 100_000 ? d : 0,
  }
}

/**
 * Idempotencia de la bandeja: «Reintentar» sobre un trabajo que YA está en marcha (`pendiente` o `en_curso`) no es un
 * conflicto sino `sin_cambios` (doble clic, otra pestaña). «Cancelar» sobre `cancelado` también.
 */
export function yaEnElDestino(accion: string, estado: string): boolean {
  if (accion === 'reintentar') return estado === 'pendiente' || estado === 'en_curso'
  if (accion === 'cancelar') return estado === 'cancelado'
  return false
}

export type FilaPaso = { intento: number | null; paso: string; inicio: Date | string; duracion_ms: number; ok: boolean; error_codigo: string | null; captura_ref: string | null }
export type PasoLectura = Omit<PasoTraza, 'paso' | 'errorCodigo'> & { intento: number; paso: string; errorCodigo: string | null; capturaRef: string | null }

export function proyectarPaso(f: FilaPaso): PasoLectura {
  return { intento: f.intento ?? 1, paso: f.paso, inicio: iso(f.inicio), duracionMs: f.duracion_ms, ok: f.ok, errorCodigo: f.error_codigo, capturaRef: f.captura_ref }
}
