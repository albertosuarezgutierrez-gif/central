'use client'

// REGISTRO de cotizadores embebidos en el bloque «Pedir precio» del riesgo (10/10/2026). `RiesgoPantalla` elige aquí,
// por ramo, qué cotizador despliega SIN salir de la oportunidad. Un ramo que no está en `RAMOS_COTIZADOR_EMBEBIDO`
// (`cotizador-embebido.ts`) sigue con el enlace a su pantalla `…-nuevo?oportunidad=`.
//
// Dar de alta un ramo nuevo (hogar, vida, salud, decesos…):
//   1. Añadirlo a `RAMOS_COTIZADOR_EMBEBIDO` (el tipo de abajo obliga entonces a registrarlo aquí).
//   2. Un `PedirPrecio<Ramo>.tsx` que monte su cotizador en modo «solo condiciones» con la carcasa común
//      `PedirPrecioEmbebido` (lectura del riesgo al abrir, bloqueo con datos viejos, nunca cotiza sin confirmar), y su
//      acción de servidor `abrirCotizador<Ramo>DeOportunidad` con `exigirCorreduria()`.
//   3. «Ver precios y emitir» de sus variantes en `HistorialVariantes` (`PRECIOS_VARIANTE`), con `PreciosVarianteGuardada`.

import type { ComponentType } from 'react'
import type { RamoCotizadorEmbebido } from './cotizador-embebido'
import type { PropsPedirPrecioEmbebido } from './PedirPrecioEmbebido'
import PedirPrecioAuto from './PedirPrecioAuto'
import PedirPrecioMoto from './PedirPrecioMoto'
import { PreciosVarianteAuto } from '../../cliente/[id]/auto-nuevo/AutoNuevo'
import { PreciosVarianteMoto } from '../../cliente/[id]/moto-nuevo/CotizadorMoto'

export const COTIZADOR_EMBEBIDO: Record<RamoCotizadorEmbebido, ComponentType<PropsPedirPrecioEmbebido>> = {
  auto: PedirPrecioAuto,
  moto: PedirPrecioMoto,
}

/** Lo que «Presupuestos de este riesgo» le da al panel «Ver precios y emitir» de una variante ya pedida. */
export type PropsPreciosVariante = {
  /** El tomador de ESA variante (la tarificación es suya). */
  clienteId: string
  oportunidadId: string
  tarificacionId: string
  /** La variante es una simulación: se enseña, nunca se emite. */
  simulado: boolean
}

/** Los ramos con cotizador embebido abren los precios de sus variantes (y su «Emitir») en la propia oportunidad. */
export const PRECIOS_VARIANTE: Record<RamoCotizadorEmbebido, ComponentType<PropsPreciosVariante>> = {
  auto: PreciosVarianteAuto,
  moto: PreciosVarianteMoto,
}
