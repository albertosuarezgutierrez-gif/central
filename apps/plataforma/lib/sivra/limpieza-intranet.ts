// Helpers puros de la intranet de limpieza (pantalla de Si que Brilla). Sin dependencias de servidor.

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

export type Novedad = {
  tipo: 'nueva' | 'cancelada'
  propertyId: string
  checkIn: string | null   // null = la fuente no publicó las fechas («no se sabe», no se inventa)
  checkOut: string | null
  pax: number | null
  detectada: string        // ISO datetime: cuándo lo VIO nuestro sync (no cuándo ocurrió en el portal)
}

/**
 * Mezcla reservas nuevas y cancelaciones en un solo hilo de novedades, de más reciente a más
 * antigua por `detectada`, con tope. No filtra por fechas: eso es del caller (SQL).
 */
export function mezclarNovedades(nuevas: Novedad[], canceladas: Novedad[], limite = 20): Novedad[] {
  return [...nuevas, ...canceladas]
    .sort((a, b) => b.detectada.localeCompare(a.detectada))
    .slice(0, limite)
}

/** ¿Está el piso ocupado la noche de `fecha`? (checkIn <= fecha < checkOut, fechas ISO comparables). */
export function nocheOcupada(
  reservas: Pick<ReservaIntranet, 'propertyId' | 'checkIn' | 'checkOut'>[],
  propertyId: string,
  fecha: string,
): ReservaIntranet | null {
  return (reservas.find(r => r.propertyId === propertyId && r.checkIn <= fecha && fecha < r.checkOut) as ReservaIntranet) ?? null
}
