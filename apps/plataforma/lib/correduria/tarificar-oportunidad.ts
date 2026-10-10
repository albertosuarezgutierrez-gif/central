// «Tarificar» desde la tarjeta de Oportunidades de la ficha (07/10/2026). PURO: decide a dónde lleva el botón.
// No cotiza nada: solo ABRE la pantalla de precio, donde el usuario confirma (0,50 €). Desde el 10/10/2026, un ramo
// con cotizador embebido (auto, moto) lleva a la PROPIA oportunidad en «Pedir precio» (`#pedir-precio`, que abre el
// cotizador al llegar); el resto, a su `…-nuevo?oportunidad=` (`rutaPedirPrecio`).

import { ramoVariante } from '../../app/(usuario)/correduria/oportunidad/[id]/variante.ts'
import { rutaPedirPrecio } from '../../app/(usuario)/correduria/oportunidad/[id]/cotizador-embebido.ts'

export type DestinoTarificar =
  /** Hay seguimiento abierto: se navega directo. */
  | { tipo: 'enlace'; href: string }
  /** Póliza sin seguimiento: antes hay que abrirlo (gratis, `/api/correduria/oportunidad/de-poliza`) y luego navegar a `ramo`. */
  | { tipo: 'abrir-y-enlazar'; polizaId: string; ramo: NonNullable<ReturnType<typeof ramoVariante>> }
  /** Ramo sin tarifa (o sin ramo): botón deshabilitado con su motivo. */
  | { tipo: 'no', motivo: string }

export function destinoTarificar(e: {
  ramo: string | null
  tomadorId: string
  /** Oportunidad ABIERTA de este seguro, si la hay. */
  oportunidadId: string | null
  polizaId: string | null
}): DestinoTarificar {
  const ramo = e.ramo ? ramoVariante(e.ramo) : null
  if (!ramo) return { tipo: 'no', motivo: e.ramo ? 'Este ramo no se tarifica desde aquí.' : 'Sin ramo: no se sabe qué tarificar.' }
  if (e.oportunidadId) return { tipo: 'enlace', href: rutaPedirPrecio(ramo, e.tomadorId, e.oportunidadId) }
  if (e.polizaId) return { tipo: 'abrir-y-enlazar', polizaId: e.polizaId, ramo }
  return { tipo: 'no', motivo: 'Abre primero su seguimiento para poder tarificar.' }
}
