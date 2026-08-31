/**
 * Vigencia de una póliza — la regla con más trampa de toda la cartera.
 *
 * Dos hechos MEDIDOS contra la base real (31/08/2026) que la condicionan:
 * - El enum `estado_poliza` NO tiene un valor «vigente», y `activa` no
 *   significa «en vigor hoy»: de 1.235 pólizas en `activa`, solo 50 vencen en
 *   el futuro. Las 25.892 `vencida` son archivo histórico de 2018.
 * - 1.194 pólizas tienen `fecha_vencimiento` a NULL (backfill legacy).
 *
 * Por eso la vigencia son TRES estados, no dos (regla global del monorepo:
 * dato que NO hay ≠ dato que NO se ha mirado):
 *   'vigente'    → estado vigente Y vencimiento hoy o futuro.
 *   'no_vigente' → estado no vigente, O vencimiento ya pasado.
 *   'pendiente'  → estado vigente pero SIN fecha de vencimiento: no se sabe.
 *                  NUNCA se colapsa a vigente («no vence») ni a no_vigente.
 *
 * La lista de estados vigentes reproduce la del CRM de origen
 * (POLIZA_ESTADOS_VIGENTES en src/lib/polizas/estados.ts, cruzada allí con la
 * migración 0086 por test). Si el origen la cambia, esta debe cambiar igual.
 */

export const POLIZA_ESTADOS_VIGENTES = [
  'activa',
  'en_renovacion',
  'en_vigor',
  'recibo_devuelto',
  'cambio_clave',
] as const

export type EstadoPolizaVigente = (typeof POLIZA_ESTADOS_VIGENTES)[number]

export type Vigencia = 'vigente' | 'no_vigente' | 'pendiente'

export function esEstadoVigente(estado: string): estado is EstadoPolizaVigente {
  return (POLIZA_ESTADOS_VIGENTES as readonly string[]).includes(estado)
}

/**
 * `hoy` se compara a nivel de DÍA en UTC (la columna es `date`): una póliza
 * que vence hoy sigue vigente hoy.
 */
export function vigenciaPoliza(
  poliza: { estado: string; fechaVencimiento: Date | null },
  hoy: Date,
): Vigencia {
  if (!esEstadoVigente(poliza.estado)) return 'no_vigente'
  if (poliza.fechaVencimiento === null) return 'pendiente'
  const v = poliza.fechaVencimiento
  const venceDia = Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())
  const hoyDia = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return venceDia >= hoyDia ? 'vigente' : 'no_vigente'
}

/** Texto para la UI del estado 'pendiente' — dice dónde mirar, no tranquiliza. */
export function explicarVigenciaPendiente(): string {
  return 'Sin fecha de vencimiento registrada: no se sabe si está en vigor. Consultar la póliza original.'
}
