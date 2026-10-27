// lib/sivra/facturas/borrador.ts — reglas PURAS del borrador (sin BD): quién puede (re)enviar datos y qué total lleva.

/**
 * ¿Se aceptan datos fiscales para esta solicitud?
 *  · Huésped (enlace público): SOLO una vez. Si ya los mandó, no se reescribe el borrador que Alberto está revisando
 *    (el ✅ emitiría lo que hubiera en BD, no lo que él vio). Las correcciones van por ✏️ de Alberto.
 *  · Alberto (sesión): siempre, mientras no esté emitida (eso lo mira el servicio).
 */
export function aceptaDatos(via: 'publico' | 'alberto', estadoSolicitud: string): { ok: true } | { ok: false; codigo: 'ya_recibida' | 'no_valida' } {
  if (estadoSolicitud === 'cancelada') return { ok: false, codigo: 'no_valida' }
  if (via === 'publico' && estadoSolicitud !== 'pendiente') return { ok: false, codigo: 'ya_recibida' }
  return { ok: true }
}

/**
 * Total del borrador (IVA incluido) y si es manual. `null` = no se sabe → no hay borrador (se avisa a Alberto).
 *  1) Alberto lo pone ahora → manda él.
 *  2) El borrador ya tiene uno manual → se conserva (un reenvío NO machaca lo que puso Alberto).
 *  3) amount_gross de la reserva (> 0).
 *  4) amount_gross desaparece (0/NULL) pero el borrador ya tenía total → se conserva el último conocido: así el
 *     borrador se actualiza con el receptor nuevo y no queda receptor nuevo en la solicitud y viejo en el borrador.
 */
export function elegirTotal(e: {
  totalManual?: number | null
  totalReserva: number | null
  existente: { total: number; manual: boolean } | null
}): { total: number; manual: boolean } | null {
  if (typeof e.totalManual === 'number' && Number.isFinite(e.totalManual) && e.totalManual > 0) return { total: Math.round(e.totalManual * 100) / 100, manual: true }
  if (e.existente?.manual) return { total: e.existente.total, manual: true }
  if (e.totalReserva !== null && e.totalReserva > 0) return { total: e.totalReserva, manual: false }
  if (e.existente && e.existente.total > 0) return { total: e.existente.total, manual: false }
  return null
}
