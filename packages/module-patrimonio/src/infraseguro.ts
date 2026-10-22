// Alerta de infraseguro de un inmueble (spec §5.8): capital de continente asegurado vs valor de reconstrucción
// ESTIMADO con los m² del Catastro (`capitalContinenteSugerido` de module-tarificacion, que calcula el adaptador).
//
// La comparación y el umbral (80 %) NO se duplican: son `avisoInfraseguro`/`UMBRAL_INFRASEGURO` de
// `@central/module-tarificacion` (el ratio es adimensional, así que admite céntimos igual que euros).
//
// 🚨 `null` = no se sabe. Sin capital o sin estimación no hay alerta NI «ok»: `sin_dato`.
// 🏢 Propiedad horizontal: el continente suele estar en la póliza de la COMUNIDAD. Si el inmueble está en comunidad
// (o no consta si lo está) y no hay póliza de comunidad enlazada, un capital propio bajo NO es infraseguro: es «no lo
// sabemos». Un capital propio que ya cubre el umbral sí es `ok` en cualquier caso (cubre por sí solo).

import { UMBRAL_INFRASEGURO, avisoInfraseguro } from '@central/module-tarificacion'

import type { Centimos } from './tipos.ts'

export { UMBRAL_INFRASEGURO }

export interface EntradaInfraseguro {
  /**
   * Capital de continente atribuible al inmueble (de su póliza; o, si es de comunidad, la parte que calcule el
   * adaptador de la póliza de comunidad). `null` = no consta.
   */
  capitalContinente: Centimos | null
  /** Valor de reconstrucción ESTIMADO. `null` = sin m² del Catastro, no se estima. */
  valorEstimado: Centimos | null
  /** `null` = no consta si está en propiedad horizontal. */
  enComunidad: boolean | null
  /** Hay una póliza de comunidad enlazada al inmueble. */
  polizaComunidadEnlazada: boolean
}

export type MotivoSinDato =
  | 'sin_capital'
  | 'sin_valor_estimado'
  /** En comunidad y sin su póliza enlazada: el continente puede estar ahí. */
  | 'comunidad_sin_poliza'
  /** No consta si está en comunidad: no se puede afirmar infraseguro. */
  | 'comunidad_no_consta'

export type AlertaInfraseguro =
  | { estado: 'sin_dato'; motivo: MotivoSinDato }
  | { estado: 'ok'; ratio: number }
  /** `faltante` = lo que falta hasta el valor estimado (la regla proporcional del art. 30 LCS mira el valor entero). */
  | { estado: 'infraseguro'; ratio: number; faltante: Centimos }

export function alertaInfraseguro(x: EntradaInfraseguro): AlertaInfraseguro {
  const valorOk = typeof x.valorEstimado === 'number' && Number.isFinite(x.valorEstimado) && x.valorEstimado > 0
  if (!valorOk) return { estado: 'sin_dato', motivo: 'sin_valor_estimado' }
  const aviso = avisoInfraseguro(x.capitalContinente, x.valorEstimado)
  if (aviso === null) return { estado: 'sin_dato', motivo: 'sin_capital' }
  if (!aviso.infraseguro) return { estado: 'ok', ratio: aviso.ratio }
  if (x.enComunidad === null) return { estado: 'sin_dato', motivo: 'comunidad_no_consta' }
  if (x.enComunidad && !x.polizaComunidadEnlazada) return { estado: 'sin_dato', motivo: 'comunidad_sin_poliza' }
  const faltante = Math.round((x.valorEstimado as number) - (x.capitalContinente as number))
  return { estado: 'infraseguro', ratio: aviso.ratio, faltante }
}
