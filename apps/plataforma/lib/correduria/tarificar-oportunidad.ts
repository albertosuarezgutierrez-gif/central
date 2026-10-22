// «Tarificar» desde la tarjeta de Oportunidades de la ficha (07/10/2026). PURO: decide a dónde lleva el botón.
// No cotiza nada: solo ABRE la pantalla de precio, donde el usuario confirma (0,50 €). Desde el 10/10/2026, un ramo
// con cotizador embebido lleva a la PROPIA oportunidad en «Pedir precio» (`#pedir-precio`, que abre el cotizador al
// llegar); el resto, a su `…-nuevo?oportunidad=` (`rutaPedirPrecio`).
//
// 22/10/2026 (Alberto): «Tarificar» SOLO se pinta cuando esa oportunidad se puede tarificar DE VERDAD. Lo decide UNA
// función, `comoSeTarifica`: ramo con API de Codeoscopic (auto, moto, hogar, salud, decesos, vida) → Avant2; si no, un
// bot RPA registrado para el ramo (`catalogoCotizacion`, hoy comunidades por Allianz) → los bots de la oportunidad; si
// no, `no` y el botón NO sale (ni deshabilitado): accidentes, RC, comercios… se cotizan y emiten en la compañía y el
// desenlace se DECLARA a mano en la oportunidad («Póliza emitida», pendiente de confirmar con CIMA).

import { ramoTarificable } from '@central/module-seguros'
import { ramoVariante, type RamoVarianteNuevo } from '../../app/(usuario)/correduria/oportunidad/[id]/variante.ts'
import { rutaPedirPrecio } from '../../app/(usuario)/correduria/oportunidad/[id]/cotizador-embebido.ts'
import { companiasDisponibles } from '../presupuestos-companias.ts'

/** El ancla del bloque «Presupuestos de compañías (bots)» de la pantalla del riesgo. */
export const ANCLA_PRESUPUESTOS_BOTS = 'presupuestos'

/** ¿Se tarifica esta oportunidad y cómo? */
export type ComoSeTarifica =
  /** Codeoscopic (Avant2, 0,50€): el cotizador del ramo. */
  | { tipo: 'avant2'; ramo: RamoVarianteNuevo }
  /** Bots RPA de compañía (gratis): las compañías con capacidad registrada para el ramo. */
  | { tipo: 'bots'; companias: string[] }
  /** No se tarifica desde aquí: se cotiza fuera y el desenlace se declara a mano. */
  | { tipo: 'no'; motivo: string }

/**
 * PURA. UNA respuesta a «¿se tarifica y cómo?» para la ficha y la pantalla del riesgo. Avant2 exige que el ramo tenga
 * cotizador (`ramoVariante`) Y tarifa en la API (`ramoTarificable` de module-seguros): son la misma lista y un test lo
 * vigila; si un día divergen, gana la prudente (no se ofrece). Bots: `catalogoCotizacion().deRamo(ramo)`.
 */
export function comoSeTarifica(ramo: string | null | undefined): ComoSeTarifica {
  if (!ramo) return { tipo: 'no', motivo: 'Sin ramo: no se sabe qué tarificar.' }
  const v = ramoVariante(ramo)
  if (v && ramoTarificable(ramo)) return { tipo: 'avant2', ramo: v }
  const companias = companiasDisponibles(ramo).map((c) => c.compania)
  if (companias.length > 0) return { tipo: 'bots', companias }
  return { tipo: 'no', motivo: 'Este ramo no se tarifica desde aquí: se cotiza en la compañía y el desenlace se declara en la oportunidad.' }
}

/** A dónde se va a tarificar una oportunidad ya abierta. `null` si no se tarifica. Nunca cotiza: solo navega. */
export function rutaTarificar(c: ComoSeTarifica, tomadorId: string, oportunidadId: string): string | null {
  if (c.tipo === 'avant2') return rutaPedirPrecio(c.ramo, tomadorId, oportunidadId)
  if (c.tipo === 'bots') return `/correduria/oportunidad/${encodeURIComponent(oportunidadId)}#${ANCLA_PRESUPUESTOS_BOTS}`
  return null
}

export type DestinoTarificar =
  /** Hay seguimiento abierto: se navega directo. */
  | { tipo: 'enlace'; href: string }
  /** Póliza sin seguimiento: antes hay que abrirlo (gratis, `/api/correduria/oportunidad/de-poliza`) y luego navegar según `como`. */
  | { tipo: 'abrir-y-enlazar'; polizaId: string; como: Exclude<ComoSeTarifica, { tipo: 'no' }> }
  /** No se tarifica (o no hay de qué colgarlo): el botón NO se pinta. */
  | { tipo: 'no'; motivo: string }

export function destinoTarificar(e: {
  ramo: string | null
  tomadorId: string
  /** Oportunidad ABIERTA de este seguro, si la hay. */
  oportunidadId: string | null
  polizaId: string | null
}): DestinoTarificar {
  const como = comoSeTarifica(e.ramo)
  if (como.tipo === 'no') return { tipo: 'no', motivo: como.motivo }
  if (e.oportunidadId) return { tipo: 'enlace', href: rutaTarificar(como, e.tomadorId, e.oportunidadId)! }
  if (e.polizaId) return { tipo: 'abrir-y-enlazar', polizaId: e.polizaId, como }
  return { tipo: 'no', motivo: 'Abre primero su seguimiento para poder tarificar.' }
}
