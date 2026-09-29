// El filtro por garantías de la parrilla y del presupuesto (28/09/2026). PURO.
//
// Marcas «Lunas» + «Asistencia» y quedan las opciones que las INCLUYEN, de la más barata a la más cara.
// 🚨 Una opción de la que no sabemos si incluye una garantía marcada (`no_consta`) NO desaparece en
// silencio: sale aparte, en `sinDato`, para que la pantalla diga «estas N no dicen si incluyen Lunas».
// Solo se descarta del todo lo que dice explícitamente que NO la incluye.

import type { EstadoGarantia, GarantiasClasificadas, RamoGarantias } from './catalogo-garantias.ts'
import { CATALOGO_GARANTIAS } from './catalogo-garantias.ts'

export type OpcionFiltrable = {
  id: string
  compania: string
  primaEur: number | null
  garantias: GarantiasClasificadas | null
}

export type ResultadoFiltro<T extends OpcionFiltrable> = {
  /** Incluyen TODAS las marcadas. Ordenadas por prima (sin prima, al final). */
  visibles: T[]
  /** No dicen si incluyen alguna marcada (y ninguna la excluye). Mismo orden. */
  sinDato: T[]
  /** Excluyen explícitamente al menos una marcada. */
  descartadas: number
}

export function estadoDe(o: OpcionFiltrable, clave: string): EstadoGarantia {
  return o.garantias?.porClave[clave] ?? 'no_consta'
}

function porPrima<T extends OpcionFiltrable>(a: T, b: T): number {
  const pa = typeof a.primaEur === 'number' && Number.isFinite(a.primaEur) ? a.primaEur : null
  const pb = typeof b.primaEur === 'number' && Number.isFinite(b.primaEur) ? b.primaEur : null
  if (pa === null && pb === null) return 0
  if (pa === null) return 1
  if (pb === null) return -1
  return pa - pb
}

export function filtrarPorGarantias<T extends OpcionFiltrable>(
  opciones: readonly T[],
  requeridas: readonly string[],
  extra: { companias?: readonly string[] } = {},
): ResultadoFiltro<T> {
  const companias = extra.companias && extra.companias.length > 0 ? new Set(extra.companias) : null
  const visibles: T[] = []
  const sinDato: T[] = []
  let descartadas = 0
  for (const o of opciones) {
    if (companias && !companias.has(o.compania)) continue
    const estados = requeridas.map((c) => estadoDe(o, c))
    if (estados.includes('no')) descartadas++
    else if (estados.includes('no_consta')) sinDato.push(o)
    else visibles.push(o)
  }
  return { visibles: visibles.sort(porPrima), sinDato: sinDato.sort(porPrima), descartadas }
}

export type InterruptorGarantia = { clave: string; etiqueta: string; conSi: number }

/**
 * Los interruptores que tiene sentido enseñar: las garantías del catálogo que ALGUNA opción incluye,
 * con cuántas la incluyen. Una garantía que ninguna opción dice incluir no se ofrece (marcarla dejaría
 * la lista vacía sin explicar por qué).
 */
export function interruptoresGarantias(ramo: RamoGarantias, opciones: readonly OpcionFiltrable[]): InterruptorGarantia[] {
  return CATALOGO_GARANTIAS[ramo]
    .map((g) => ({ clave: g.clave, etiqueta: g.etiqueta, conSi: opciones.filter((o) => estadoDe(o, g.clave) === 'si').length }))
    .filter((i) => i.conSi > 0)
}

/**
 * Garantías que salen YA marcadas en el filtro, en la pantalla del corredor y en el portal del
 * cliente (Alberto, 28/09/2026: «que salga ya seleccionada grúa siempre, todas la incluyen»).
 * Solo las que tienen interruptor: marcar una que no se ve dejaría un filtro imposible de quitar.
 */
export const GARANTIAS_PRESELECCIONADAS: Partial<Record<RamoGarantias, readonly string[]>> = {
  auto: ['asistencia_viaje'],
  moto: ['asistencia_viaje'],
}

export function preseleccionFija(ramo: RamoGarantias | null, interruptores: readonly InterruptorGarantia[]): string[] {
  if (ramo === null) return []
  const fijas = new Set(GARANTIAS_PRESELECCIONADAS[ramo] ?? [])
  return interruptores.map((i) => i.clave).filter((c) => fijas.has(c))
}

export type DiferenciasOpcion = { noIncluye: string[]; sinConfirmar: string[] }

/**
 * Qué separa a ESTA opción de las demás de la misma parrilla (29/09/2026): «no incluye» y «sin
 * confirmar» solo en las garantías en las que las opciones NO dicen lo mismo. Sirve para que dos
 * precios que parecen iguales no se lean como iguales (Allianz con asistencia estándar frente a
 * Mapfre, que no dice qué asistencia trae). Solo cuentan las opciones ya clasificadas: una sin leer
 * (`garantias === null`) ni aporta ni recibe diferencias (`null`), y eso no es «igual que las demás».
 * PURO. Etiquetas del catálogo, en su orden.
 */
export function diferenciasDeOpcion(
  ramo: RamoGarantias,
  opcion: OpcionFiltrable,
  opciones: readonly OpcionFiltrable[],
): DiferenciasOpcion | null {
  if (opcion.garantias === null) return null
  const leidas = opciones.filter((o) => o.garantias !== null)
  const r: DiferenciasOpcion = { noIncluye: [], sinConfirmar: [] }
  for (const g of CATALOGO_GARANTIAS[ramo]) {
    if (new Set(leidas.map((o) => estadoDe(o, g.clave))).size < 2) continue
    const e = estadoDe(opcion, g.clave)
    if (e === 'no') r.noIncluye.push(g.etiqueta)
    else if (e === 'no_consta') r.sinConfirmar.push(g.etiqueta)
  }
  return r
}
