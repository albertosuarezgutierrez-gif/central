// lib/sivra/cobros-ota.ts — vigilante de cobros OTA (Booking/Airbnb/Expedia/Agoda).
// Empareja reservas con check-out pasado contra los abonos del banco para detectar dinero que
// las OTAs ya deberían haber pagado y no ha entrado. La parte pura (reconciliarCobrosOTA) no toca
// BD y se testea con node --test. Decisión de diseño: el canal del abono NO se puede deducir con
// fiabilidad (los cobros del Dúplex llegan con concepto genérico "ABONO... LIQ. OP.") → el match es
// OTA-wide por importe+fecha, y el margen lo aporta el canal de la RESERVA (fiable, de incomes.portal).

export type CanalOTA = 'BOOKING' | 'AIRBNB' | 'EXPEDIA' | 'AGODA'

export interface ReservaOTA {
  reservationId: string
  canal: CanalOTA
  guestName: string | null
  checkOut: string // 'YYYY-MM-DD'
  neto: number
}

export interface AbonoOTA {
  fecha: string // 'YYYY-MM-DD'
  importe: number
}

export interface ConfigCobros {
  margenDias: Record<CanalOTA, number>
  umbralEur: number
  toleranciaEur: number
}

// Booking/Airbnb pagan a los pocos días del checkout; Expedia ~1 mes; Agoda ~2 semanas.
export const CONFIG_COBROS_DEFAULT: ConfigCobros = {
  margenDias: { BOOKING: 7, AIRBNB: 7, EXPEDIA: 35, AGODA: 14 },
  umbralEur: 50,
  toleranciaEur: 0.02,
}

export interface Pendiente {
  reservationId: string
  guestName: string | null
  checkOut: string
  neto: number
  canal: CanalOTA
}

export interface ResultadoCobros {
  hayDescuadre: boolean
  pendientes: Pendiente[]
  huerfanos: AbonoOTA[]
  pendientesEur: number
  huerfanosEur: number
}

// Suma una cantidad de días a una fecha 'YYYY-MM-DD' (en UTC, sin tocar zona horaria).
function addDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function reconciliarCobrosOTA(
  reservas: ReservaOTA[],
  abonos: AbonoOTA[],
  hoy: string, // 'YYYY-MM-DD'
  config: ConfigCobros = CONFIG_COBROS_DEFAULT,
): ResultadoCobros {
  // Reservas ya terminadas (checkout pasado), de más antigua a más reciente.
  const vencidas = reservas
    .filter(r => r.checkOut <= hoy)
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))
  // Abonos ordenados por fecha asc para emparejar con el más antiguo que encaje.
  const abonosOrd = [...abonos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const usado = new Array(abonosOrd.length).fill(false)
  const matched = new Set<number>()

  vencidas.forEach((r, ri) => {
    const limite = addDias(r.checkOut, config.margenDias[r.canal])
    const idx = abonosOrd.findIndex((a, ai) =>
      !usado[ai] &&
      Math.abs(a.importe - r.neto) <= config.toleranciaEur &&
      a.fecha >= r.checkOut && a.fecha <= limite,
    )
    if (idx >= 0) { usado[idx] = true; matched.add(ri) }
  })

  // Pendiente = reserva vencida, sin abono, y que YA pasó su margen (si está dentro de plazo, no avisa).
  const pendientes: Pendiente[] = vencidas
    .map((r, ri) => ({ r, ri }))
    .filter(({ r, ri }) => !matched.has(ri) && addDias(r.checkOut, config.margenDias[r.canal]) < hoy)
    .map(({ r }) => ({
      reservationId: r.reservationId, guestName: r.guestName,
      checkOut: r.checkOut, neto: r.neto, canal: r.canal,
    }))

  const huerfanos: AbonoOTA[] = abonosOrd.filter((_, ai) => !usado[ai])
  const pendientesEur = round2(pendientes.reduce((s, p) => s + p.neto, 0))
  const huerfanosEur = round2(huerfanos.reduce((s, a) => s + a.importe, 0))
  // v1: dispara SOLO por pendientes (dinero que debían pagar). Huérfanos = contexto, no disparo.
  const hayDescuadre = pendientesEur > config.umbralEur

  return { hayDescuadre, pendientes, huerfanos, pendientesEur, huerfanosEur }
}
