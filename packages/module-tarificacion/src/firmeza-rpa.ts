// Firmeza de un precio del tarificador RPA (30/10/2026, regla de Alberto «SINCO al tarificar»). PURA: sin BD ni red.
//
// En casi todas las compañías (Allianz, Mapfre, Generali…), si al TARIFICAR se teclea el nº de póliza anterior, la compañía consulta
// SINCO en ese momento y el presupuesto que devuelve YA lleva la siniestralidad real: es precio CONFIRMADO por la compañía (`firme`,
// el valor de firmeza que ya existía para «sin reservas»). Sin ese número el bot declara la siniestralidad más favorable (supuesto) y
// el precio es `estimado`, como hasta hoy. Excepción: Occident no consulta SINCO al tarificar (hasta tener volumen) → siempre estimado.
//
// `firme` exige TRES cosas a la vez (cualquier duda = `estimado`, el estado conservador):
//   1. compañía ≠ Occident (lista `COMPANIAS_SIN_SINCO_AL_TARIFICAR`) y ramo `auto`;
//   2. el riesgo llevaba el nº de póliza anterior (`polizaAnteriorUltimos5`, 5 cifras exactas);
//   3. el bot confirmó que lo tecleó y releyó (`oferta.polizaAnteriorTecleada === true`).
// 🚨 TARIFICAR ≠ EMITIR. El número es dato del cliente: aquí solo se mira su FORMA, nunca se devuelve ni se registra.

import type { OfertaNormalizada } from './tipos.ts'

export type FirmezaPrecioRpa = 'firme' | 'estimado'

/** Compañías que NO consultan SINCO al tarificar aunque se teclee el nº de póliza anterior (Alberto, 30/10/2026). */
export const COMPANIAS_SIN_SINCO_AL_TARIFICAR: readonly string[] = Object.freeze(['occident'])

/** Ramos en los que aplica la regla (hoy solo auto: es lo que Alberto ha confirmado). */
const RAMOS_SINCO_AL_TARIFICAR: readonly string[] = Object.freeze(['auto'])

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** ¿El riesgo trae el nº de póliza anterior con la forma que teclean los bots (5 cifras exactas)? Nunca devuelve el valor. PURA. */
export function riesgoTraePolizaAnterior(riesgo: unknown): boolean {
  if (!esObj(riesgo)) return false
  const v = riesgo.polizaAnteriorUltimos5
  return typeof v === 'string' && /^\d{5}$/.test(v.trim())
}

/** ¿Esta compañía, en este ramo, confirma el precio con SINCO al tarificar? PURA. */
export function companiaConfirmaConSinco(compania: unknown, ramo: unknown): boolean {
  if (typeof compania !== 'string' || typeof ramo !== 'string') return false
  const c = compania.trim().toLowerCase()
  if (c === '' || COMPANIAS_SIN_SINCO_AL_TARIFICAR.includes(c)) return false
  return RAMOS_SINCO_AL_TARIFICAR.includes(ramo.trim().toLowerCase())
}

/**
 * Firmeza de UNA oferta del bot al guardarla (con el riesgo del trabajo delante). `compania` = código del trabajo (`mapfre`,
 * `allianz`, `occident`…), no el nombre que enseña el portal. PURA.
 */
export function firmezaPrecioRpa(e: { compania: unknown; ramo: unknown; riesgo: unknown; oferta: Pick<OfertaNormalizada, 'polizaAnteriorTecleada'> | null | undefined }): FirmezaPrecioRpa {
  if (!companiaConfirmaConSinco(e.compania, e.ramo)) return 'estimado'
  if (!riesgoTraePolizaAnterior(e.riesgo)) return 'estimado'
  return e.oferta?.polizaAnteriorTecleada === true ? 'firme' : 'estimado'
}

/**
 * Las ofertas tal como se GUARDAN (`tarificaciones.respuesta.ofertas`): la señal `polizaAnteriorTecleada` solo se conserva si la
 * oferta sale `firme` con el riesgo del trabajo (así quien las relea sin el riesgo — presupuesto, propuesta — no ve una señal que
 * no cumplía las tres condiciones). PURA.
 */
export function ofertasConFirmezaRpa(compania: unknown, ramo: unknown, riesgo: unknown, ofertas: readonly OfertaNormalizada[]): { oferta: OfertaNormalizada; firmeza: FirmezaPrecioRpa }[] {
  return ofertas.map((o) => {
    const firmeza = firmezaPrecioRpa({ compania, ramo, riesgo, oferta: o })
    if (firmeza === 'firme') return { oferta: o, firmeza }
    const { polizaAnteriorTecleada: _quitada, ...resto } = o
    return { oferta: resto, firmeza }
  })
}

/**
 * Firmeza de una oferta YA GUARDADA (releída de `tarificaciones.respuesta`, cuya `compania` es el código del trabajo): la señal solo
 * sobrevive al guardado si cumplía el riesgo (`ofertasConFirmezaRpa`); aquí se vuelven a exigir compañía y ramo. PURA.
 */
export function firmezaOfertaRpaGuardada(compania: unknown, ramo: unknown, oferta: Pick<OfertaNormalizada, 'polizaAnteriorTecleada'> | null | undefined): FirmezaPrecioRpa {
  if (!companiaConfirmaConSinco(compania, ramo)) return 'estimado'
  return oferta?.polizaAnteriorTecleada === true ? 'firme' : 'estimado'
}

/** El bot marca sus ofertas cuando tecleó y releyó el nº de póliza anterior. `false` → las ofertas tal cual (sin señal). PURA. */
export function conPolizaAnteriorTecleada(ofertas: readonly OfertaNormalizada[], tecleada: boolean): OfertaNormalizada[] {
  return tecleada ? ofertas.map((o) => ({ ...o, polizaAnteriorTecleada: true as const })) : [...ofertas]
}
