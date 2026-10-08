// Bandeja «Necesita tu atención» del tarificador RPA (08/10/2026) — lo PURO: proyección de filas a lo que ve
// plataforma. Sin BD ni red (`node --test`). Las reglas de estado y el motivo legible viven en
// `@central/module-tarificacion` (`bandeja.ts`).
//
// 🛡️ Lista blanca: id, compañía, ramo, estado, tipo de error, motivo legible, fechas, intentos, versión del bot y
//    enlace a la oportunidad. NUNCA el mensaje técnico crudo, la URL del portal, el riesgo, el HTML/captura ni nada
//    del cliente.

import { decidirAccionBandeja, motivoLegible, type PasoTraza } from '@central/module-tarificacion'

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
  }
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
