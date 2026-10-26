// Qué pólizas se OFRECEN al crear la hoja de la nevera, a partir de la cartera que la persona ya ve.
// PURO (sin Prisma ni sesión): lo comparten el selector (`polizasElegibles`) y su test.
//
// 🚨 No decide accesos: recibe la salida de `carteraDeIdentidad()` —la MISMA lectura que pinta la
// bóveda— y solo la recorre (`candidatasDeLaHoja`, regla 6 de `hoja-qr.ts`). Si una póliza no está en
// esa cartera (autorización revocada, acotada a otra póliza, ficha sin relación), aquí no puede
// aparecer. Las pólizas AÑADIDAS a mano no entran: la hoja es solo cartera viva.
import { candidatasDeLaHoja, coberturaEspecificaDeRamo, etiquetaRamo } from '@central/module-seguros-portal'

import type { CarteraPortal, PolizaPortal } from './cartera-lectura.ts'

export type OpcionHoja = {
  id: string
  /** Qué póliza es: compañía · tipo · qué asegura (el nº solo si no hay bien que nombrar). */
  etiqueta: string
  /** De quién es la póliza (nombre de la ficha titular), para no confundir la del coche propio con la de la empresa. */
  titular: string
  /** `true` = propia. Solo las propias entran con «todas». */
  propia: boolean
}

/**
 * Qué identifica la póliza: la MISMA cadena que el titular de «Mis seguros» (`tituloDePoliza`): cosa (matrícula…)
 * → ubicación (inmueble) → cobertura que especializa el ramo; el nº solo de último recurso. `ubicacion` ya llega
 * capada por nivel y por `direccionRiesgo` (`cartera-lectura.ts`): aquí no se decide quién la ve.
 */
export function etiquetaPolizaHoja(
  p: Pick<PolizaPortal, 'compania' | 'ramo' | 'numeroPoliza' | 'bien'> & { coberturas?: { lista?: readonly unknown[] } | null },
): string {
  const que =
    p.bien.cosa ??
    p.bien.ubicacion ??
    coberturaEspecificaDeRamo(p.ramo, (p.coberturas?.lista ?? []) as Parameters<typeof coberturaEspecificaDeRamo>[1]) ??
    (p.numeroPoliza ? `nº ${p.numeroPoliza}` : null)
  return [p.compania, etiquetaRamo(p.ramo), que].filter(Boolean).join(' · ')
}

export function elegiblesDeCartera(c: Pick<CarteraPortal, 'propias' | 'autorizadas' | 'intervinientes'>): OpcionHoja[] {
  return candidatasDeLaHoja<PolizaPortal>(c).map((x) => ({
    id: x.id,
    etiqueta: etiquetaPolizaHoja(x.poliza),
    titular: x.titular,
    propia: x.propia,
  }))
}
