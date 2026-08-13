// lib/sivra/cancelaciones.ts — qué se guarda cuando Smoobu dice que una reserva se canceló.
//
// PURO y testeado: no toca BD ni red. La escritura la hace `smoobu-sync.ts`.
//
// 🚨 POR QUÉ EXISTE ESTO (12/08/2026). El sync ya VEÍA las cancelaciones —pide
// `showCancellation=1` a propósito— y hacía lo correcto con el ingreso: `DELETE FROM incomes`,
// porque una reserva cancelada no se cobra y no puede inflar el calendario ni el P&L. Pero al
// borrar la fila destruía también el ÚNICO rastro de que la cancelación existió: el contador
// `cnt.cancelled` moría en el texto del latido y nada quedaba en BD.
//
// El coste de eso se vio al mirar Smoobu a mano: mayo-noviembre de 2026 acumula **67
// cancelaciones / 269 noches** contra 79 reservas / 241 noches consumidas. Se cancela más noche
// de la que se duerme, y ningún panel del monorepo podía enseñarlo — ni saber si el patrón es
// de un piso, de un portal o de una antelación concreta. No era un dato a NULL: era un hecho
// que se tiraba a la basura en cada pasada.
//
// La regla que se aplica aquí es la del CLAUDE.md, «dato que NO hay ≠ dato que NO se ha mirado»,
// llevada al nombre de las columnas:
//
//   · `cancelacion_vista_at` = cuándo la VIMOS nosotros, NO cuándo el huésped canceló. El listado
//     de Smoobu marca `type: 'cancellation'` pero no publica la fecha del acto en ese payload, así
//     que llamar a esta columna `cancelada_at` sería inventarse una precisión que no tenemos: una
//     cancelación de hace tres semanas que el sync ve hoy quedaría fechada hoy. El payload íntegro
//     se guarda en `datos` para que, si algún día se confirma que la API trae la fecha real, se
//     pueda extraer hacia atrás sin volver a pedirle nada a Smoobu.
//
//   · `estaba_en_incomes` distingue las dos cancelaciones que NO son lo mismo: la de una reserva
//     que llegamos a contar como ingreso (y por tanto se descuenta de verdad) y la de una que se
//     hizo y se deshizo entre dos pasadas del sync, que nunca llegó a existir para nosotros.
//     Mezclarlas haría que «noches perdidas» contase noches que jamás estuvieron reservadas.
//
//   · `property_id` puede ser NULL si el nombre del apartamento no casa con `properties`. En ese
//     caso se conserva `property_name` tal cual lo mandó Smoobu: preferimos una fila con el piso
//     sin resolver a perder la cancelación entera, que es lo que pasaba hasta ahora.

/** Lo que Smoobu devuelve por reserva, en lo que aquí se usa. Campos en kebab-case como la API. */
export type ReservaSmoobu = {
  id: number | string
  type?: string
  arrival?: string
  departure?: string
  price?: number | string
  channel?: { name?: string }
  apartment?: { name?: string }
  'guest-name'?: string
  'created-at'?: string
  'is-blocked-booking'?: boolean
}

export type FilaCancelacion = {
  reservation_id: string
  property_id: string | null
  property_name: string | null
  portal: string
  guest_name: string | null
  check_in: string | null
  check_out: string | null
  nights: number | null
  amount_gross: number | null
  reserved_at: string | null
  estaba_en_incomes: boolean
}

function fecha(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Noches entre dos fechas. Devuelve `null` —no 0— si falta alguna: un 0 se sumaría en los
 * agregados como «cancelación de cero noches», que es una afirmación, y aquí no sabemos nada.
 */
export function nochesPerdidas(entrada?: string, salida?: string): number | null {
  const ci = fecha(entrada)
  const co = fecha(salida)
  if (!ci || !co) return null
  const n = Math.round((co.getTime() - ci.getTime()) / 86400000)
  return n > 0 ? n : null
}

/**
 * Arma la fila a persistir a partir del payload de Smoobu.
 *
 * `propertyId` lo resuelve el llamador (tiene el mapa de `properties`); `estabaEnIncomes` sale de
 * si el DELETE encontró algo. El precio se guarda TAL CUAL viene de Smoobu, que es el BRUTO — el
 * neto de `incomes` lo calcula un trigger a partir de `portal_rates`, y aquí no hay trigger: meter
 * un neto en una columna llamada `amount_gross` es el error que ya costó un 20% de ingreso
 * fantasma en el sync (ver la cabecera de `smoobu-sync.ts`).
 */
export function filaCancelacion(
  b: ReservaSmoobu,
  opts: { propertyId: string | null; portal: string; estabaEnIncomes: boolean },
): FilaCancelacion {
  const precio = typeof b.price === 'string' ? parseFloat(b.price) : b.price
  return {
    reservation_id: String(b.id),
    property_id: opts.propertyId,
    property_name: b.apartment?.name?.trim() || null,
    portal: opts.portal,
    guest_name: b['guest-name']?.trim() || null,
    check_in: fecha(b.arrival)?.toISOString() ?? null,
    check_out: fecha(b.departure)?.toISOString() ?? null,
    nights: nochesPerdidas(b.arrival, b.departure),
    amount_gross: Number.isFinite(precio as number) ? (precio as number) : null,
    reserved_at: fecha(b['created-at'])?.toISOString() ?? null,
    estaba_en_incomes: opts.estabaEnIncomes,
  }
}

/**
 * Antelación con la que se canceló, en días: de cuándo se reservó a cuándo se iba a entrar.
 * `null` si falta cualquiera de las dos fechas — es la métrica que dirá si las cancelaciones
 * son ruido de reservas recién hechas o huecos reales a última hora, y para eso no puede
 * apoyarse en un 0 inventado.
 */
export function diasDeAntelacion(reservedAt: string | null, checkIn: string | null): number | null {
  const r = fecha(reservedAt ?? undefined)
  const c = fecha(checkIn ?? undefined)
  if (!r || !c) return null
  return Math.round((c.getTime() - r.getTime()) / 86400000)
}
