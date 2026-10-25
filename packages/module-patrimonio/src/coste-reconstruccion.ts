// Capital de continente MÍNIMO estimado de un inmueble SIN pedir datos al cliente (25/10/2026):
//   superficie construida del Catastro (m²) × coste de reconstrucción (€/m²) del catálogo de abajo, por tipo de inmueble.
// PURO: la superficie entra ya leída (la cachea el portal en el inmueble); aquí no hay red, BD ni reloj.
//
// 🚨 Es una ESTIMACIÓN, nunca un dato: todo valor del catálogo va marcado `por_verificar` hasta que Alberto lo confirme con
// una fuente (tabla de una tasadora, módulos de reconstrucción de una compañía o de las asociaciones de peritos). Hasta
// entonces, cualquier texto que lo use dice «estimación».
// `null` = no se estima (sin superficie, superficie ≤ 0 o un uso que no tiene continente propio): nunca 0.
//
// Fuente de los números: son los MISMOS órdenes de magnitud que `COSTE_RECONSTRUCCION_EUR_M2` de `@central/module-tarificacion`
// (hogar-asesor.ts, 20/10/2026: «el valor de reconstrucción habitual de un piso va de ~1.000 a ~1.500 €/m²»), tomados del
// tramo MEDIO-BAJO a propósito (una estimación mínima: mejor no avisar de más). Local/oficina/nave: sin fuente propia, por
// analogía y a la baja. Fecha del criterio: 25/10/2026. No hay cita externa verificada.

import type { Centimos } from './tipos.ts'

export type EstadoValorCatalogo = 'por_verificar' | 'verificado'

export const CLAVES_COSTE = ['vivienda_piso', 'vivienda_unifamiliar', 'vivienda', 'local', 'oficina', 'nave'] as const
export type ClaveCoste = (typeof CLAVES_COSTE)[number]

export interface EntradaCatalogoCoste {
  eurPorM2: number
  estado: EstadoValorCatalogo
  fuente: string
  /** `dd/mm/aaaa` del criterio. */
  fecha: string
}

const F = '25/10/2026'
const BASE = 'Orden de magnitud de module-tarificacion (COSTE_RECONSTRUCCION_EUR_M2, tramo medio-bajo); sin cita externa'
const ANALOGIA = 'Por analogía con vivienda, a la baja; sin fuente propia'

export const COSTE_RECONSTRUCCION_POR_TIPO: Readonly<Record<ClaveCoste, EntradaCatalogoCoste>> = Object.freeze({
  vivienda_piso: { eurPorM2: 1000, estado: 'por_verificar', fuente: BASE, fecha: F },
  vivienda_unifamiliar: { eurPorM2: 1100, estado: 'por_verificar', fuente: BASE, fecha: F },
  /** Vivienda sin saber si es piso o unifamiliar: el valor más bajo de los dos. */
  vivienda: { eurPorM2: 1000, estado: 'por_verificar', fuente: BASE, fecha: F },
  local: { eurPorM2: 800, estado: 'por_verificar', fuente: ANALOGIA, fecha: F },
  oficina: { eurPorM2: 900, estado: 'por_verificar', fuente: ANALOGIA, fecha: F },
  nave: { eurPorM2: 500, estado: 'por_verificar', fuente: ANALOGIA, fecha: F },
})

/** `uso` del inmueble del portal (`USOS_INMUEBLE`) + lo que el Catastro dijo de la vivienda → clave del catálogo. */
export function claveCoste(uso: string, tipoVivienda: 'piso' | 'unifamiliar' | null | undefined): ClaveCoste | null {
  if (uso === 'vivienda') return tipoVivienda === 'piso' ? 'vivienda_piso' : tipoVivienda === 'unifamiliar' ? 'vivienda_unifamiliar' : 'vivienda'
  if (uso === 'local' || uso === 'oficina' || uso === 'nave') return uso
  return null // garaje, trastero, otro: sin continente propio que estimar
}

export interface ContinenteMinimoEstimado {
  /** Céntimos, redondeado a la centena de euros. */
  capitalCent: Centimos
  superficieM2: number
  eurPorM2: number
  clave: ClaveCoste
  /** Siempre `true`: el texto que lo use tiene que decirlo. */
  estimacion: true
  /** `true` mientras el valor del catálogo no esté verificado. */
  porVerificar: boolean
}

export function estimarContinenteMinimo(x: {
  superficieM2: number | null | undefined
  uso: string
  tipoVivienda?: 'piso' | 'unifamiliar' | null
}): ContinenteMinimoEstimado | null {
  const m2 = x.superficieM2
  if (typeof m2 !== 'number' || !Number.isFinite(m2) || m2 <= 0) return null
  const clave = claveCoste(x.uso, x.tipoVivienda)
  if (clave === null) return null
  const e = COSTE_RECONSTRUCCION_POR_TIPO[clave]
  const capitalCent = Math.round((m2 * e.eurPorM2) / 100) * 100 * 100
  if (capitalCent <= 0) return null
  return { capitalCent, superficieM2: m2, eurPorM2: e.eurPorM2, clave, estimacion: true, porVerificar: e.estado === 'por_verificar' }
}

/** ¿Es un piso en edificio en división horizontal? `null` = no se sabe (no se supone). */
export function esPisoEnEdificio(x: { enComunidad: boolean | null; tipoCatastro: 'piso' | 'unifamiliar' | null }): boolean | null {
  if (x.enComunidad === true || x.tipoCatastro === 'piso') return true
  if (x.enComunidad === false || x.tipoCatastro === 'unifamiliar') return false
  return null
}

/**
 * «Seguro de la comunidad» (Encargo B): se ofrece al presidente/administrador de una comunidad cuando el inmueble es un
 * piso en edificio y NO hay ya una póliza de comunidad en vigor enlazada. Todo `null` = no se ofrece (no se supone).
 * `presidente`: lo marca el cliente (tri-estado; `null` = no lo ha dicho).
 */
export function ofreceSeguroComunidad(x: {
  esPiso: boolean | null
  presidente: boolean | null
  polizaComunidadVigente: boolean | null
}): boolean {
  return x.esPiso === true && x.presidente === true && x.polizaComunidadVigente === false
}
