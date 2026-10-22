// El enlace del INQUILINO (spec §5.9): sin cuenta del portal; el enlace dice QUÉ contrato, el código al correo dice
// QUIÉN (patrón de las invitaciones). Aquí: el estado del enlace y la LISTA BLANCA de lo que ve.
//
// 🚨 FAIL-CLOSED. Solo `vigente` enseña algo. Un enlace anulado, de otro contrato, de un inquilino que ya no está en el
// contrato, o de un contrato terminado hace más del margen → nada.
// 🚨 La vista se CONSTRUYE campo a campo (nunca `...contrato`): lo que no está en `CAMPOS_VISTA_INQUILINO` no sale.
// El inquilino no ve renta, fianza, gastos, rentabilidad, titular, otros inquilinos ni el alias interno del inmueble
// cuando hay dirección (el alias lo pone el propietario para sí).
// 📜 El `fin` PACTADO no caduca el enlace: con la prórroga de la LAU el contrato sigue vivo; solo `terminadoEn` cuenta.
// 🚨 Ninguna función lee el reloj: `hoy` entra como parámetro.

import { esFecha, sumarDias, type Fecha } from './fechas.ts'
import type { Contrato, Inmueble } from './tipos.ts'

/** Días que el enlace sigue abierto tras terminar el contrato (devolución de fianza, última avería, recibos). */
export const DIAS_ENLACE_TRAS_TERMINAR = 60

export interface EnlaceInquilino {
  contratoId: string
  inquilinoId: string
  /** `null` = no anulado. Anular no borra. */
  anuladoEn: Date | null
}

export type EstadoEnlace = 'vigente' | 'anulado' | 'caducado' | 'no_corresponde'

/**
 * Orden: anulado gana a todo (es definitivo); luego que el enlace corresponda a ESTE contrato e inquilino; luego la
 * caducidad por terminación. Una fecha de terminación ilegible se trata como caducado (no se abre a ciegas).
 */
export function estadoEnlace(
  enlace: EnlaceInquilino,
  contrato: Pick<Contrato, 'id' | 'inquilinoIds' | 'terminadoEn'>,
  hoy: Fecha,
  diasTrasTerminar: number = DIAS_ENLACE_TRAS_TERMINAR,
): EstadoEnlace {
  if (enlace.anuladoEn !== null) return 'anulado'
  if (enlace.contratoId !== contrato.id) return 'no_corresponde'
  if (!contrato.inquilinoIds.includes(enlace.inquilinoId)) return 'no_corresponde'
  if (!esFecha(hoy)) return 'caducado'
  if (contrato.terminadoEn !== null) {
    if (!esFecha(contrato.terminadoEn)) return 'caducado'
    if (!Number.isInteger(diasTrasTerminar) || diasTrasTerminar < 0) return 'caducado'
    if (hoy > sumarDias(contrato.terminadoEn, diasTrasTerminar)) return 'caducado'
  }
  return 'vigente'
}

/** Lo ÚNICO que ve el inquilino. Cambiar esta lista es una decisión (y la cubre un test). */
export const CAMPOS_VISTA_INQUILINO = ['inmueble', 'inicio', 'fin', 'terminadoEn', 'seguro'] as const

export interface VistaInquilino {
  /** Dirección del inmueble; si no consta, el alias. `null` = no hay ninguno. */
  inmueble: string | null
  inicio: Fecha
  fin: Fecha | null
  terminadoEn: Fecha | null
  /** `null` = el contrato no dice nada del seguro del inquilino (no consta). */
  seguro: { exigido: boolean; venceRecibo: Fecha | null } | null
}

export type ResultadoEnlace =
  | { estado: 'vigente'; vista: VistaInquilino }
  | { estado: Exclude<EstadoEnlace, 'vigente'> }

export function vistaDelEnlace(
  enlace: EnlaceInquilino,
  contrato: Contrato,
  inmueble: Pick<Inmueble, 'id' | 'alias' | 'direccion'>,
  hoy: Fecha,
  diasTrasTerminar: number = DIAS_ENLACE_TRAS_TERMINAR,
): ResultadoEnlace {
  const estado = estadoEnlace(enlace, contrato, hoy, diasTrasTerminar)
  if (estado !== 'vigente') return { estado }
  if (inmueble.id !== contrato.inmuebleId) return { estado: 'no_corresponde' }
  const direccion = inmueble.direccion?.trim() || null
  const alias = inmueble.alias?.trim() || null
  const s = contrato.seguroInquilino
  return {
    estado: 'vigente',
    vista: {
      inmueble: direccion ?? alias,
      inicio: contrato.inicio,
      fin: contrato.fin,
      terminadoEn: contrato.terminadoEn,
      seguro: s === null ? null : { exigido: s.exigido, venceRecibo: s.venceRecibo },
    },
  }
}
