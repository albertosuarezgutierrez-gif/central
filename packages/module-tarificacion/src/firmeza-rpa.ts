// Firmeza de un precio del tarificador RPA (30/10/2026, regla de Alberto «SINCO al tarificar»). PURA: sin BD ni red.
//
// En casi todas las compañías (Allianz, Mapfre, Generali…), si al TARIFICAR se teclea el nº de póliza anterior, la compañía consulta
// SINCO en ese momento y el presupuesto que devuelve YA lleva la siniestralidad real: es precio CONFIRMADO por la compañía (`firme`,
// el valor de firmeza que ya existía para «sin reservas»). Sin ese número el bot declara la siniestralidad más favorable (supuesto) y
// el precio es `estimado`, como hasta hoy. Excepción: Occident no consulta SINCO al tarificar (hasta tener volumen) → siempre estimado.
//
// `firme` exige CUATRO cosas a la vez (cualquier duda = `estimado`, el estado conservador):
//   1. compañía ≠ Occident (lista `COMPANIAS_SIN_SINCO_AL_TARIFICAR`) y ramo `auto`;
//   2. el riesgo llevaba el nº de póliza anterior (`polizaAnteriorUltimos5`, 5 cifras exactas);
//   3. el bot confirmó que lo tecleó y releyó (`oferta.polizaAnteriorTecleada === true`);
//   4. (revisión de seguridad) la oferta NO lleva supuestos aplicados por el bot (`ofertaLlevaSupuestos`): versión elegida por
//      similitud, antecedentes favorables supuestos, siniestros/uso/garaje por defecto, conductor = tomador… Un precio calculado
//      con un dato inventado no es «confirmado por la compañía» aunque SINCO haya hablado. Aviso que no sepamos clasificar = estimado.
// 🚨 TARIFICAR ≠ EMITIR. El número es dato del cliente: aquí solo se mira su FORMA, nunca se devuelve ni se registra.

import type { OfertaNormalizada } from './tipos.ts'
import { PREFIJO_SUPUESTOS, SUPUESTO_CONDUCTOR_TOMADOR, SUPUESTO_FAVORABLE_ANIOS, SUPUESTO_FAVORABLE_SINIESTROS } from './supuestos-auto.ts'
import { AVISO_VERSION_POR_SIMILITUD } from './vehiculo-confirmado.ts'

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

/** Fragmentos (en minúsculas) que delatan un aviso de SUPUESTO del bot aunque no lleve el prefijo canónico. */
const MARCAS_SUPUESTO: readonly string[] = Object.freeze(['supuest', 'por similitud', 'por defecto', 'no consta'])

/** ¿Este aviso declara algo que el bot supuso? Conservador: cualquiera de las marcas conocidas o los textos canónicos. PURA. */
export function avisoEsSupuesto(aviso: unknown): boolean {
  if (typeof aviso !== 'string') return true // aviso que no sabemos leer → conservador
  const a = aviso.trim()
  if (a.startsWith(PREFIJO_SUPUESTOS) || a === AVISO_VERSION_POR_SIMILITUD) return true
  if ([SUPUESTO_FAVORABLE_ANIOS, SUPUESTO_FAVORABLE_SINIESTROS, SUPUESTO_CONDUCTOR_TOMADOR].some((x) => a.includes(x))) return true
  const m = a.toLowerCase()
  return MARCAS_SUPUESTO.some((x) => m.includes(x))
}

/** ¿La oferta lleva supuestos del bot? `avisos` no-array = no se sabe → `true` (conservador). PURA. */
export function ofertaLlevaSupuestos(oferta: { avisos?: unknown } | null | undefined): boolean {
  if (!oferta || !Array.isArray(oferta.avisos)) return true
  return oferta.avisos.some(avisoEsSupuesto)
}

/**
 * Firmeza de UNA oferta del bot al guardarla (con el riesgo del trabajo delante). `compania` = código del trabajo (`mapfre`,
 * `allianz`, `occident`…), no el nombre que enseña el portal. PURA.
 */
export function firmezaPrecioRpa(e: { compania: unknown; ramo: unknown; riesgo: unknown; oferta: Pick<OfertaNormalizada, 'polizaAnteriorTecleada' | 'avisos'> | null | undefined }): FirmezaPrecioRpa {
  if (!companiaConfirmaConSinco(e.compania, e.ramo)) return 'estimado'
  if (!riesgoTraePolizaAnterior(e.riesgo)) return 'estimado'
  if (ofertaLlevaSupuestos(e.oferta)) return 'estimado'
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
export function firmezaOfertaRpaGuardada(compania: unknown, ramo: unknown, oferta: (Pick<OfertaNormalizada, 'polizaAnteriorTecleada'> & { avisos?: unknown }) | null | undefined): FirmezaPrecioRpa {
  if (!companiaConfirmaConSinco(compania, ramo)) return 'estimado'
  // Las ofertas guardadas ya perdieron la señal si llevaban supuestos (`ofertasConFirmezaRpa`); si aun así traen avisos, se vuelven a mirar.
  if (oferta && Array.isArray(oferta.avisos) && oferta.avisos.some(avisoEsSupuesto)) return 'estimado'
  return oferta?.polizaAnteriorTecleada === true ? 'firme' : 'estimado'
}

/** El bot marca sus ofertas cuando tecleó y releyó el nº de póliza anterior. `false` → las ofertas tal cual (sin señal). PURA. */
export function conPolizaAnteriorTecleada(ofertas: readonly OfertaNormalizada[], tecleada: boolean): OfertaNormalizada[] {
  return tecleada ? ofertas.map((o) => ({ ...o, polizaAnteriorTecleada: true as const })) : [...ofertas]
}
