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

// ¿Podemos FIARNOS de la lista que devolvió Smoobu para decidir disponibilidad? Devuelve las estancias
// DE ESTE PISO, o null (= «no verificado») si la respuesta no se entiende, viene paginada o trae
// estancias fuera de la ventana pedida — señal de que Smoobu ignoró el filtro.
//
// Caso fundacional (26/09/2026, reserva 157252361, Duplex Center): el agente dijo «la noche anterior
// está libre» cuando otra reserva (150035011) SALÍA ese mismo día. La consulta usaba `apartments[]` y
// `from`/`to`, que en /api/reservations no están garantizados, y una lista vacía o incompleta se leía
// como «libre». Aquí un filtro ignorado degrada a «no verificado», nunca a «libre».
export function estanciasFiables(
  resp: any,
  opts: { apartmentId: string | number; campo: 'arrival' | 'departure'; desde: string; hasta: string },
): Estancia[] | null {
  const lista = Array.isArray(resp?.bookings) ? resp.bookings : Array.isArray(resp?.data) ? resp.data : null
  if (!lista) return null
  if (Number(resp?.page_count ?? 1) > 1) return null // truncada: lo que falta podría ser la que ocupa
  for (const e of lista) {
    const f = e?.[opts.campo]
    if (typeof f !== 'string' || f < opts.desde || f > opts.hasta) return null
  }
  const apt = String(opts.apartmentId)
  // Sin id de piso en la estancia no se descarta: ante la duda, cuenta como ocupación.
  return lista.filter((e: any) => {
    const id = e?.apartment?.id ?? e?.apartmentId
    return id == null || String(id) === apt
  })
}

// Combina las dos fuentes de «¿está libre?»: el CALENDARIO volcado (`incomes`, que el webhook de
// Smoobu mantiene al día y del que se borran las cancelaciones) y la consulta EN VIVO a Smoobu (la
// única que ve los bloqueos manuales). true = libre · false = ocupado · null = no se pudo mirar.
// Basta con que UNA diga ocupado para que lo esté; «libre» exige que al menos una lo haya mirado.
export function combinarFuentes(calendario: boolean | null, vivo: boolean | null): { posible: boolean; chequeado: boolean } {
  if (calendario === false || vivo === false) return { posible: false, chequeado: true }
  if (calendario === true || vivo === true) return { posible: true, chequeado: true }
  return { posible: false, chequeado: false }
}
