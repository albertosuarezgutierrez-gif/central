/**
 * Qué se precarga en la pantalla de precio de auto desde `info_riesgo.datosVehiculo` (05/10/2026).
 *
 * Regla única: el riesgo se rellena UNA vez (documento o corredora) y la pantalla lo lee de ahí; nunca se vuelve a pedir
 * lo que ya consta. Antes la cascada solo se precargaba ENTERA (versión + marca + modelo + motor); ahora es PARCIAL: cada
 * paso se precarga si el anterior lo está (marca → modelo → combustible → versión), y la marca/modelo/versión que solo
 * constan en TEXTO se ofrecen como pista del buscador (nunca como selección: la elige la corredora).
 *
 * Puro: sin React ni red. Una variante retomada (`?tarificacion=`) manda sobre todo y el riesgo no precarga nada.
 */
import type { DatosVehiculoRiesgo } from '@central/module-seguros'

export type PrecargaVehiculo = {
  /** Ids a repoblar en cascada; `null` = no hay marcaId (o está retomada): nada que cargar. */
  cascada: { marcaId: string; modeloId?: string; motorId?: string; codigoVehiculo?: string } | null
  /** La cascada trae los cuatro ids: el vehículo del riesgo manda sobre la última tarificación y el borrador. */
  completa: boolean
  /** Marca/modelo/versión en texto SIN id: se pintan en la caja de búsqueda del selector. */
  pistaMarca: string | null
  pistaModelo: string | null
  pistaVersion: string | null
  /** Se precarga siempre (si no hay variante retomada, que ya trae la suya). */
  fechaMatriculacion: string | null
  /** El riesgo no está confirmado por la corredora: lo precargado se marca «sin confirmar». */
  sinConfirmar: boolean
}

export function planPrecargaVehiculo(datos: DatosVehiculoRiesgo | null | undefined, retomada: boolean): PrecargaVehiculo {
  if (!datos || retomada) {
    return { cascada: null, completa: false, pistaMarca: null, pistaModelo: null, pistaVersion: null, fechaMatriculacion: null, sinConfirmar: false }
  }
  const cascada: NonNullable<PrecargaVehiculo['cascada']> | null = datos.marcaId
    ? {
        marcaId: datos.marcaId,
        ...(datos.modeloId ? { modeloId: datos.modeloId } : {}),
        // Sin modelo, un motor suelto no tiene sentido (la versión cuelga de marca+modelo+motor).
        ...(datos.modeloId && datos.motorId ? { motorId: datos.motorId } : {}),
        ...(datos.modeloId && datos.motorId && datos.codigoVehiculo ? { codigoVehiculo: datos.codigoVehiculo } : {}),
      }
    : null
  return {
    cascada,
    completa: !!(cascada?.modeloId && cascada.motorId && cascada.codigoVehiculo),
    pistaMarca: datos.marcaId ? null : datos.marca,
    pistaModelo: datos.modeloId ? null : datos.modelo,
    pistaVersion: datos.codigoVehiculo ? null : datos.version,
    fechaMatriculacion: datos.fechaMatriculacion,
    sinConfirmar: datos.confirmadoAt === null,
  }
}

/** ¿El valor que hay en pantalla sigue siendo el precargado del riesgo (y el riesgo está sin confirmar)? */
export function sigueSinConfirmar(plan: PrecargaVehiculo, precargado: string | null | undefined, actual: string): boolean {
  return plan.sinConfirmar && !!precargado && precargado === actual
}
