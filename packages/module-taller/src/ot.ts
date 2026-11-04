// Máquina de estados de la orden de trabajo (OT).
//
//   recepcion → presupuesto → aceptado → en_curso ⇄ ampliacion_pendiente
//                                          en_curso → terminado → facturado → entregado
//   terminado → entregado (decisión de Alberto, 04/11/2026: recepción entrega el coche sin esperar a la factura, que es F2;
//                          exige la recepción firmada: se devuelve contra el resguardo)
//   terminado → en_curso (reapertura ANTES de facturar)
//   recepcion | presupuesto | aceptado → cancelada (rechazo o retirada antes de empezar)
//
// Facturar es irreversible (factura inmutable; se corrige con rectificativa). `entregado` y `cancelada` son finales.
// Las guardias exigen el dato EXPLÍCITO: un contexto sin el campo (undefined) NO autoriza la transición.

export const ESTADOS_OT = [
  'recepcion',
  'presupuesto',
  'aceptado',
  'en_curso',
  'ampliacion_pendiente',
  'terminado',
  'facturado',
  'entregado',
  'cancelada',
] as const
export type EstadoOt = (typeof ESTADOS_OT)[number]

export const TRANSICIONES_OT: Readonly<Record<EstadoOt, readonly EstadoOt[]>> = {
  recepcion: ['presupuesto', 'cancelada'],
  presupuesto: ['aceptado', 'cancelada'],
  aceptado: ['en_curso', 'cancelada'],
  en_curso: ['ampliacion_pendiente', 'terminado'],
  ampliacion_pendiente: ['en_curso'],
  terminado: ['facturado', 'entregado', 'en_curso'],
  facturado: ['entregado'],
  entregado: [],
  cancelada: [],
}

export interface ContextoTransicionOt {
  /** Recepción con firma del cliente (resguardo de depósito). */
  recepcionFirmada?: boolean
  /** El presupuesto origen está aceptado por el cliente (enlace con token o firma). */
  presupuestoAceptado?: boolean
  /** Partes de horas abiertos sobre esta OT. */
  partesAbiertos?: number
  /** Ampliaciones enviadas al cliente sin respuesta. */
  ampliacionesPendientes?: number
  /** Factura emitida (VeriFactu) para esta OT. */
  facturaEmitida?: boolean
}

export type ResultadoTransicion = { ok: true; estado: EstadoOt } | { ok: false; motivo: string }

export function esEstadoOt(x: string): x is EstadoOt {
  return (ESTADOS_OT as readonly string[]).includes(x)
}

export function esFinal(e: EstadoOt): boolean {
  return TRANSICIONES_OT[e].length === 0
}

export function puedeTransicionar(desde: EstadoOt, hacia: EstadoOt): boolean {
  return TRANSICIONES_OT[desde].includes(hacia)
}

export function transicionarOt(desde: EstadoOt, hacia: EstadoOt, ctx: ContextoTransicionOt = {}): ResultadoTransicion {
  if (!puedeTransicionar(desde, hacia)) return { ok: false, motivo: `transición no permitida: ${desde} → ${hacia}` }

  if (hacia === 'presupuesto' && ctx.recepcionFirmada !== true) {
    return { ok: false, motivo: 'la recepción no está firmada' }
  }
  if (hacia === 'aceptado' && ctx.presupuestoAceptado !== true) {
    return { ok: false, motivo: 'el presupuesto no está aceptado por el cliente' }
  }
  if (desde === 'ampliacion_pendiente' && hacia === 'en_curso' && ctx.ampliacionesPendientes !== 0) {
    return { ok: false, motivo: 'hay ampliaciones sin respuesta del cliente' }
  }
  if (hacia === 'terminado') {
    if (ctx.partesAbiertos !== 0) return { ok: false, motivo: 'hay partes de horas abiertos' }
    if (ctx.ampliacionesPendientes !== 0) return { ok: false, motivo: 'hay ampliaciones sin respuesta del cliente' }
  }
  if (hacia === 'facturado') {
    if (ctx.recepcionFirmada !== true) return { ok: false, motivo: 'no se factura sin recepción firmada' }
    if (ctx.facturaEmitida !== true) return { ok: false, motivo: 'la factura no está emitida' }
  }
  if (desde === 'terminado' && hacia === 'entregado' && ctx.recepcionFirmada !== true) {
    return { ok: false, motivo: 'no se entrega el vehículo sin la recepción firmada' }
  }
  return { ok: true, estado: hacia }
}
