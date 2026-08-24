// lib/sivra/noches-sin-income.ts — clasifica las «noches fantasma»: fechas futuras que el
// calendario de Smoobu tiene bloqueadas (available=0) sin ningún income que las cubra.
//
// Caso fundacional (24/08/2026): Busto Reform 15-17 abr 2027 llevaba TRES ciclos del agente de
// pricing apareciendo «vendida a 103€ sin income». Era una reserva REAL de Airbnb (HM9KR9FJFK,
// creada el 20/06/2026) que el sync incremental se saltó —probablemente en el hueco de la semana
// de la migración de crons (17-22/06)— y nadie tenía forma de enterarse: el income no existía y
// el calendario solo decía «no disponible». Este módulo es la pieza pura del check #10 del
// guardián (`pricing/guard`), que contrasta esas noches contra Smoobu EN VIVO y repara re-lanzando
// el sync sobre la ventana de llegada.
//
// Regla de la casa: la cobertura noche↔reserva SIEMPRE compara por fecha civil (YYYY-MM-DD),
// nunca el timestamptz crudo — hay filas de `incomes` con checkIn a las 12:00 UTC y compararlas
// sin normalizar da falso justo en la noche del check-in (4 falsos «sin income» el 24/08/2026).

/** Reserva de Smoobu reducida a lo que la clasificación necesita. */
export type ReservaVentana = {
  id: string
  /** YYYY-MM-DD */
  arrival: string | null
  /** YYYY-MM-DD (exclusivo: la noche de salida no está ocupada) */
  departure: string | null
  /** `type === 'cancellation'` en el listado de Smoobu */
  cancelada: boolean
  /** `is-blocked-booking`: bloqueo manual del dueño, no una venta */
  bloqueada: boolean
  guestName: string | null
  /** nombre del apartamento tal y como lo publica Smoobu */
  apartmentName: string | null
}

/** Adapta un booking crudo del API de Smoobu (claves kebab-case) a `ReservaVentana`. */
export function reservaDesdeSmoobu(b: any): ReservaVentana {
  const fecha = (s: unknown): string | null =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
  return {
    id: String(b?.id ?? ''),
    arrival: fecha(b?.arrival),
    departure: fecha(b?.departure),
    cancelada: b?.type === 'cancellation',
    bloqueada: !!b?.['is-blocked-booking'],
    guestName: b?.['guest-name'] ?? null,
    apartmentName: b?.apartment?.name ?? null,
  }
}

export type TipoNocheFantasma =
  /** una reserva VIVA cubre la noche y no está en incomes → el sync se la saltó (reparable) */
  | 'reserva_sin_income'
  /** bloqueo manual del dueño (is-blocked-booking): sin income A PROPÓSITO, no es un fallo */
  | 'bloqueo_manual'
  /** solo la cubre una cancelación: el calendario aún no refleja la liberación (se cura solo) */
  | 'cancelada'
  /** Smoobu no devuelve NADA que la cubra: bloqueo a nivel de tarifa u otra cosa — a mirar */
  | 'sin_explicar'

export type NocheClasificada = {
  fecha: string
  tipo: TipoNocheFantasma
  /** la reserva que la explica, si la hay (la viva antes que el bloqueo, el bloqueo antes que la cancelada) */
  reserva: ReservaVentana | null
}

const cubre = (r: ReservaVentana, fecha: string): boolean =>
  !!r.arrival && !!r.departure && r.arrival <= fecha && r.departure > fecha

/**
 * Clasifica UNA noche bloqueada-sin-income contra las reservas que Smoobu devuelve para su ventana.
 * Prioridad deliberada: una reserva viva manda sobre un bloqueo, y ambos sobre una cancelación —
 * lo que importa es el estado más «caro» de pasar por alto.
 */
export function clasificarNoche(fecha: string, reservas: ReservaVentana[]): NocheClasificada {
  const cubren = reservas.filter(r => cubre(r, fecha))
  const viva = cubren.find(r => !r.cancelada && !r.bloqueada)
  if (viva) return { fecha, tipo: 'reserva_sin_income', reserva: viva }
  const bloqueo = cubren.find(r => r.bloqueada && !r.cancelada)
  if (bloqueo) return { fecha, tipo: 'bloqueo_manual', reserva: bloqueo }
  const cancelada = cubren.find(r => r.cancelada)
  if (cancelada) return { fecha, tipo: 'cancelada', reserva: cancelada }
  return { fecha, tipo: 'sin_explicar', reserva: null }
}

/** Agrupa fechas YYYY-MM-DD (no necesariamente ordenadas) en rangos consecutivos inclusivos. */
export function agruparRangos(fechas: string[]): { desde: string; hasta: string }[] {
  const orden = [...new Set(fechas)].sort()
  const rangos: { desde: string; hasta: string }[] = []
  for (const f of orden) {
    const ult = rangos[rangos.length - 1]
    if (ult && diaSiguiente(ult.hasta) === f) ult.hasta = f
    else rangos.push({ desde: f, hasta: f })
  }
  return rangos
}

function diaSiguiente(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Ventana de llegada con la que pedir a Smoobu las reservas que pueden cubrir estas noches.
 * Se abre 35 días hacia atrás: una estancia larga puede cubrir la noche habiendo llegado
 * semanas antes, y el filtro `from`/`to` del API va por fechas de la reserva.
 */
export function ventanaConsulta(fechas: string[]): { desde: string; hasta: string } | null {
  const orden = [...new Set(fechas)].sort()
  if (!orden.length) return null
  const min = new Date(orden[0] + 'T00:00:00Z')
  min.setUTCDate(min.getUTCDate() - 35)
  return { desde: min.toISOString().slice(0, 10), hasta: diaSiguiente(orden[orden.length - 1]) }
}
