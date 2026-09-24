/**
 * Reglas PURAS de «un presupuesto cuelga de su oportunidad» (24/09/2026). Alberto:
 * «dos botones de presupuesto, que es lo mismo que oportunidad». Pedir precio y
 * abrir una oportunidad eran dos cosas sin enlace: el presupuesto no salía en la
 * tarjeta de Oportunidades y la venta se quedaba sin seguimiento.
 *
 * Aquí solo se decide; la escritura vive en `oportunidad-presupuesto.ts`.
 */
import { RAMOS_OPORTUNIDAD, type RamoOportunidad } from '@central/module-seguros'

/** El ramo del presupuesto como ramo de oportunidad, o `null` si no es uno de ellos (no se inventa). */
export function ramoDeOportunidad(ramo: unknown): RamoOportunidad | null {
  return RAMOS_OPORTUNIDAD.find(r => r === ramo) ?? null
}

/**
 * Con un precio en la mano, la oportunidad ya no está «por contactar»: pasa a
 * «interesado» (en negociación). Si ya estaba esperando al cliente, se queda así.
 */
export function estadoTrasPresupuesto(actual: string): string {
  return actual === 'competencia' ? 'en_negociacion' : actual
}

/** Estados que cuentan como oportunidad ABIERTA: la misma lista que usa el alta a mano. */
export const ESTADOS_ABIERTA = ['competencia', 'en_negociacion', 'pendiente_cliente'] as const

/** De dónde nace la oportunidad: retarificar una póliza propia es una renovación; sin póliza, venta. */
export function fuenteDePresupuesto(polizaId: string | null | undefined): 'renovacion' | 'venta_directa' {
  return polizaId ? 'renovacion' : 'venta_directa'
}

/** Días hasta el primer paso de una oportunidad nacida de un presupuesto: llamar para presentarlo. */
export const DIAS_PRIMER_PASO = 2
