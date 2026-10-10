// «Tarificar» desde la tarjeta de Oportunidades de la ficha (07/10/2026). PURO: decide a dónde lleva el botón.
// No cotiza nada: solo ABRE la pantalla de precio (`…-nuevo?oportunidad=`), donde el usuario confirma (0,50 €).
// Reutiliza `ramoVariante`/`rutaVariante` (la misma ruta que «Pedir precio» del riesgo): la pantalla de destino
// lee ramo, vehículo/matrícula, compañía y vencimiento de la propia oportunidad.

import { ramoVariante, rutaVariante } from '../../app/(usuario)/correduria/oportunidad/[id]/variante.ts'

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
  if (e.oportunidadId) return { tipo: 'enlace', href: rutaVariante(ramo, e.tomadorId, e.oportunidadId) }
  if (e.polizaId) return { tipo: 'abrir-y-enlazar', polizaId: e.polizaId, ramo }
  return { tipo: 'no', motivo: 'Abre primero su seguimiento para poder tarificar.' }
}
