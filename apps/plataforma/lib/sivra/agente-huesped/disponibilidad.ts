// lib/sivra/agente-huesped/disponibilidad.ts — ¿está LIBRE la noche ANTERIOR a la llegada?
//
// Regla de Alberto (23/06/2026): el early check-in (entrada anticipada) es GRATIS, pero solo se
// puede confirmar si NADIE duerme la VÍSPERA. Ojo: puede haber una reserva que SALE el mismo día
// de la llegada (departure === arrival) → esa noche anterior está ocupada (hay que limpiar y aún
// hay huéspedes esa mañana) → NO hay early check-in. Si la noche anterior está libre, sí.
//
// Puro y testeable (sin red): contexto.ts le pasa las estancias que trae de Smoobu.

export type Estancia = { id?: string | number; arrival?: string; departure?: string; type?: string }

// Resta n días a una fecha YYYY-MM-DD (UTC, sin librerías). Devuelve '' si la fecha no es válida.
export function restarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export const diaAnterior = (fecha: string): string => restarDias(fecha, 1)

// ¿La noche anterior a `arrival` está libre? Está OCUPADA si alguna OTRA estancia cubre esa noche,
// es decir: entra en/antes de la víspera y sale en/después del día de llegada (incluye el caso de
// salir el MISMO día de la llegada). Las fechas Smoobu son 'YYYY-MM-DD' → comparación lexicográfica.
export function nocheAnteriorLibre(arrival: string, estancias: Estancia[], selfId?: string | number): boolean {
  const noche = diaAnterior(arrival)
  if (!noche) return false // sin fecha fiable → conservador: NO confirmar early check-in
  for (const e of estancias || []) {
    if (!e || !e.arrival || !e.departure) continue
    if (selfId != null && String(e.id) === String(selfId)) continue // la propia reserva no cuenta
    if ((e.type || '').toLowerCase() === 'cancellation') continue   // cancelaciones no ocupan
    if (e.arrival <= noche && e.departure >= arrival) return false  // alguien duerme la víspera
  }
  return true
}

// Suma n días a una fecha YYYY-MM-DD (UTC). Complementario de restarDias, para ventanas hacia delante.
export const sumarDias = (fecha: string, n: number): string => restarDias(fecha, -n)

// ¿Hay otra reserva que ENTRA el mismo día en que este huésped SALE? Si la hay, el piso necesita
// turnover (limpieza + entrada de otro huésped) ese día → no hay margen para un late check-out.
// Espejo de nocheAnteriorLibre, pero mirando hacia delante desde la salida en vez de hacia atrás
// desde la llegada.
export function entradaMismoDiaLibre(checkOut: string, estancias: Estancia[], selfId?: string | number): boolean {
  if (!checkOut) return false // sin fecha fiable → conservador: NO confirmar late check-out
  for (const e of estancias || []) {
    if (!e || !e.arrival) continue
    if (selfId != null && String(e.id) === String(selfId)) continue // la propia reserva no cuenta
    if ((e.type || '').toLowerCase() === 'cancellation') continue   // cancelaciones no ocupan
    if (e.arrival === checkOut) return false // alguien entra ese mismo día
  }
  return true
}
