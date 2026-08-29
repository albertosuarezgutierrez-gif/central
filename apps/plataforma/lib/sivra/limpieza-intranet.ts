// Helpers puros de la intranet de limpieza (pantalla de Vanesa). Sin dependencias de servidor.

export type ReservaIntranet = {
  propertyId: string
  checkIn: string   // 'AAAA-MM-DD'
  checkOut: string  // 'AAAA-MM-DD'
  pax: number | null
}

/**
 * Nº de huéspedes de una reserva. Tres estados: si adults Y children son NULL, la fuente
 * (Smoobu vía incomes) todavía no lo ha dicho → null («no se sabe»), nunca 0.
 * Si solo falta uno de los dos, el que falta cuenta como 0 (sí sabemos el otro).
 */
export function paxDe(adults: number | null | undefined, children: number | null | undefined): number | null {
  if (adults == null && children == null) return null
  return (adults ?? 0) + (children ?? 0)
}

/**
 * ¿Entra un huésped ese mismo día en ese piso? Se deriva de las reservas (checkIn === fecha),
 * NO de cleaning_sessions.checkin_time: el cron auto-sessions rellena '15:00' por defecto
 * aunque no entre nadie, así que ese campo no distingue «entra hoy» de «no entra».
 */
export function entradaMismoDia(
  reservas: Pick<ReservaIntranet, 'propertyId' | 'checkIn' | 'pax'>[],
  propertyId: string,
  fecha: string,
): { pax: number | null } | null {
  const r = reservas.find(x => x.propertyId === propertyId && x.checkIn === fecha)
  return r ? { pax: r.pax } : null
}

/** ¿Está el piso ocupado la noche de `fecha`? (checkIn <= fecha < checkOut, fechas ISO comparables). */
export function nocheOcupada(
  reservas: Pick<ReservaIntranet, 'propertyId' | 'checkIn' | 'checkOut'>[],
  propertyId: string,
  fecha: string,
): ReservaIntranet | null {
  return (reservas.find(r => r.propertyId === propertyId && r.checkIn <= fecha && fecha < r.checkOut) as ReservaIntranet) ?? null
}
