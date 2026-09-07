// lib/sivra/pricing-fuga-canal.ts — lo que el huésped PAGA contra lo que el motor CREE que lista.
//
// POR QUÉ (07/09/2026, reserva 154638741 de House Sevillana, 05-07/03/2027). El motor había dejado
// esas dos noches a 523€ y 542€ de base: con el canal calibrado (`escaparate = 1,056 × base + 120€`)
// eso son ~623€/noche de lista, el percentil 60 del mercado medido de esa fecha. Es decir, el motor
// hizo su trabajo. Y el huésped pagó 981,02€ por las dos noches. Nadie lo medía: el calibrado del
// canal (`pricing/canal`) mide el ESCAPARATE contra la base, y el centinela del huésped compara ese
// escaparate con el mercado — los dos miran el precio LISTADO. Entre lo listado y lo cobrado hay una
// capa que vive en el extranet de Booking y que el motor no ve.
//
// LA CAPA, MEDIDA en el extranet la misma tarde (Alberto, literal de la reserva 6188885041):
//
//   Standard Rate (Booking)  = base Smoobu × 1,20          628€ y 651€  (523 × 1,2 · 542 × 1,2)
//   × Basic Deal 12 %        → precio público, ordenador   = base × 1,056  ← esto es `channel_markup`
//   × Mobile rate 10 %
//   × Genius nivel 2-3 15 %  → cobrado                     0,88 × 0,90 × 0,85 = 0,6732 del Standard
//                                                           422,77€ + 438,25€ = 861,02€
//   + limpieza 120€/estancia (NO descontable)               = 981,02€  ← `incomes.amount_gross`
//
// Dos consecuencias que este módulo incorpora y que la primera versión (misma mañana) no sabía:
//   1. El bruto de Booking LLEVA la limpieza dentro. Compararlo entero contra base×markup daba 0,87
//      para esta reserva; sobre el alojamiento es 0,764. La cuota se resta ANTES de dividir.
//   2. `channel_markup` = 1,056 = 1,20 × 0,88: el calibrado ya trae el Basic Deal, porque el
//      escaparate que raspa es el que ve un huésped sin Genius desde ordenador. O sea, `base ×
//      markup` es la LISTA PÚBLICA y este ratio mide lo que se pierde POR DEBAJO de ella (móvil +
//      Genius + lo que se apile). El 12 % del Basic Deal se pierde ANTES y aquí no se ve: el
//      motor lo absorbe subiendo la base, y por eso el objetivo p60 se cumple en lista y no en caja.
//
// Este módulo MIDE esa capa desde `incomes` (bruto real por reserva) y la base que el motor tenía
// puesta cuando entró la reserva. No decide precios. Tres estados, como manda la casa: sin reservas
// no hay ratio (null), muestra corta se informa sin juzgar, y solo con muestra suficiente se dice
// «fuga». Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

import { type ParametrosCanal } from './pricing-canal.ts'

export interface ReservaCobrada {
  reservationId: string
  /** noches de la estancia (≥1) */
  nights: number
  /** bruto total de la reserva antes de comisión (`incomes.amount_gross`), limpieza INCLUIDA */
  brutoTotal: number
  /**
   * Base MEDIA de Smoobu en esas noches en el momento de reservar (última escritura del motor antes
   * de `reserved_at`). `null` = el motor no había tarifado esas noches: no se puede juzgar.
   */
  baseMedia: number | null
  /** YYYY-MM-DD del check-in, solo para el informe */
  checkIn?: string
}

export type EstadoFuga = 'sin_reservas' | 'muestra_corta' | 'ok' | 'fuga'

export interface ReservaJuzgada {
  reservationId: string
  checkIn?: string
  nights: number
  /** (bruto − limpieza) / noches: lo que el huésped pagó por DORMIR cada noche */
  cobradoNoche: number
  /** base × markup: la lista pública (sin Genius, sin móvil, sin limpieza) que el motor creía vender */
  listaNoche: number
  /** cobradoNoche / listaNoche */
  ratio: number
}

export interface FugaCanal {
  estado: EstadoFuga
  /** reservas con base conocida (las que forman el ratio) */
  n: number
  /** reservas que el motor no había tarifado: se cuentan, no se juzgan */
  nSinBase: number
  /** reservas cuyo bruto no cubre ni la limpieza: dato raro, se cuenta y no se juzga */
  nBrutoRaro: number
  /** mediana de cobradoNoche / listaNoche. `null` sin reservas juzgables */
  ratio: number | null
  /** € de alojamiento que separan lo cobrado de la lista pública en el periodo (>0 = cobrado por debajo) */
  eurosBajoLista: number | null
  umbral: number
  minReservas: number
  /** las reservas con peor ratio, para que el aviso diga CUÁLES */
  peores: ReservaJuzgada[]
}

export interface FugaCanalOpts {
  /** reservas juzgables mínimas para emitir veredicto (por debajo: `muestra_corta`) */
  minReservas?: number
  /** por debajo de este ratio (mediana) el estado es `fuga` */
  umbral?: number
  /** cuántas reservas listar en `peores` */
  maxPeores?: number
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function fugaCanal(reservas: ReservaCobrada[], canal: ParametrosCanal, o: FugaCanalOpts = {}): FugaCanal {
  const minReservas = o.minReservas ?? 5
  const umbral = o.umbral ?? 0.9
  const maxPeores = o.maxPeores ?? 3
  const markup = Number(canal.markup) > 0 ? Number(canal.markup) : 1
  const cuota = Number(canal.cuotaFija) > 0 ? Number(canal.cuotaFija) : 0

  const juzgadas: ReservaJuzgada[] = []
  let nSinBase = 0
  let nBrutoRaro = 0
  let eurosBajoLista = 0
  for (const r of reservas) {
    const nights = Number(r.nights)
    if (!(nights >= 1) || !(r.brutoTotal > 0)) continue
    if (r.baseMedia == null || !(r.baseMedia > 0)) { nSinBase++; continue }
    const alojamiento = r.brutoTotal - cuota
    if (!(alojamiento > 0)) { nBrutoRaro++; continue }
    const cobradoNoche = alojamiento / nights
    const listaNoche = r.baseMedia * markup
    juzgadas.push({
      reservationId: r.reservationId, checkIn: r.checkIn, nights,
      cobradoNoche: Math.round(cobradoNoche),
      listaNoche: Math.round(listaNoche),
      ratio: cobradoNoche / listaNoche,
    })
    eurosBajoLista += (listaNoche - cobradoNoche) * nights
  }

  const n = juzgadas.length
  const ratio = mediana(juzgadas.map(j => j.ratio))
  const peores = [...juzgadas].sort((a, b) => a.ratio - b.ratio).slice(0, maxPeores)

  let estado: EstadoFuga
  if (n === 0) estado = 'sin_reservas'
  else if (n < minReservas) estado = 'muestra_corta'
  else if ((ratio as number) < umbral) estado = 'fuga'
  else estado = 'ok'

  return {
    estado, n, nSinBase, nBrutoRaro,
    ratio: ratio == null ? null : Number(ratio.toFixed(3)),
    eurosBajoLista: n === 0 ? null : Math.round(eurosBajoLista),
    umbral, minReservas, peores,
  }
}
