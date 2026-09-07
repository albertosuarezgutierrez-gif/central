// lib/sivra/pricing-fuga-canal.ts — lo que el huésped PAGA contra lo que el motor CREE que lista.
//
// POR QUÉ (07/09/2026, reserva 154638741 de House Sevillana, 05-07/03/2027). El motor había dejado
// esas dos noches a 523€ y 542€ de base: con el canal calibrado (`escaparate = 1,056 × base + 60€`)
// eso son ~623€/noche de lista, el percentil 60 del mercado medido de esa fecha. Es decir, el motor
// hizo su trabajo. Y el huésped pagó 981,02€ por las dos noches: 490,51€/noche, un 21% por debajo
// de la lista y por debajo del comparable MÁS BARATO de los diez medidos ese mismo día.
//
// No era esa reserva: en las 12 reservas de Booking de House desde el 15/07/2026 el bruto cobrado por
// noche fue de media el 0,88 de la BASE (no de la lista: de la base), o sea ~0,79 de la lista. En los
// otros tres pisos, 0,86-0,94 de la base. Nadie lo medía: el calibrado del canal (`pricing/canal`)
// mide el ESCAPARATE contra la base, y el centinela del huésped compara ese escaparate con el
// mercado — los dos miran el precio LISTADO. Entre lo listado y lo cobrado hay una capa que vive en
// el extranet de Booking (Genius, tarifa móvil, ofertas apiladas) y que el motor no ve: cada noche
// que vende, vende un ~20% por debajo de donde cree estar, y el objetivo p60 se convierte en un p25.
//
// Este módulo MIDE esa capa desde `incomes` (bruto real por reserva) y la base que el motor tenía
// puesta cuando entró la reserva. No decide precios. Tres estados, como manda la casa: sin reservas
// no hay ratio (null), muestra corta se informa sin juzgar, y solo con muestra suficiente se dice
// «fuga». El umbral compara contra `base × markup` SIN la cuota fija a propósito: no está medido si
// el bruto que reporta Booking incluye la limpieza, y el ratio contra la lista completa sería el
// más alarmante de los dos — se da también, pero como dato, no como veredicto.
//
// Módulo PURO (sin BD ni `@/`), testeable con `node --test`.

import { type ParametrosCanal } from './pricing-canal.ts'

export interface ReservaCobrada {
  reservationId: string
  /** noches de la estancia (≥1) */
  nights: number
  /** bruto total de la reserva antes de comisión (`incomes.amount_gross`) */
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
  cobradoNoche: number
  /** base × markup (sin cuota) */
  listaSinCuotaNoche: number
  /** base × markup + cuota / noches de ESTA estancia */
  listaNoche: number
  ratioSinCuota: number
  ratioLista: number
}

export interface FugaCanal {
  estado: EstadoFuga
  /** reservas con base conocida (las que forman los ratios) */
  n: number
  /** reservas que el motor no había tarifado: se cuentan, no se juzgan */
  nSinBase: number
  /** mediana de cobrado / (base × markup). `null` sin reservas juzgables */
  ratioSinCuota: number | null
  /** mediana de cobrado / lista completa (con cuota). Informativo: ver cabecera */
  ratioLista: number | null
  /** € brutos que separan lo cobrado de `base × markup` en el periodo (>0 = cobrado por debajo) */
  eurosBajoBase: number | null
  umbral: number
  minReservas: number
  /** las reservas con peor ratio, para que el aviso diga CUÁLES */
  peores: ReservaJuzgada[]
}

export interface FugaCanalOpts {
  /** reservas juzgables mínimas para emitir veredicto (por debajo: `muestra_corta`) */
  minReservas?: number
  /** por debajo de este ratio (mediana, sin cuota) el estado es `fuga` */
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
  let eurosBajoBase = 0
  for (const r of reservas) {
    const nights = Number(r.nights)
    if (!(nights >= 1) || !(r.brutoTotal > 0)) continue
    if (r.baseMedia == null || !(r.baseMedia > 0)) { nSinBase++; continue }
    const cobradoNoche = r.brutoTotal / nights
    const listaSinCuotaNoche = r.baseMedia * markup
    const listaNoche = listaSinCuotaNoche + cuota / nights
    juzgadas.push({
      reservationId: r.reservationId, checkIn: r.checkIn, nights,
      cobradoNoche: Math.round(cobradoNoche),
      listaSinCuotaNoche: Math.round(listaSinCuotaNoche),
      listaNoche: Math.round(listaNoche),
      ratioSinCuota: cobradoNoche / listaSinCuotaNoche,
      ratioLista: cobradoNoche / listaNoche,
    })
    eurosBajoBase += (listaSinCuotaNoche - cobradoNoche) * nights
  }

  const n = juzgadas.length
  const ratioSinCuota = mediana(juzgadas.map(j => j.ratioSinCuota))
  const ratioLista = mediana(juzgadas.map(j => j.ratioLista))
  const peores = [...juzgadas].sort((a, b) => a.ratioSinCuota - b.ratioSinCuota).slice(0, maxPeores)

  let estado: EstadoFuga
  if (n === 0) estado = 'sin_reservas'
  else if (n < minReservas) estado = 'muestra_corta'
  else if ((ratioSinCuota as number) < umbral) estado = 'fuga'
  else estado = 'ok'

  return {
    estado, n, nSinBase,
    ratioSinCuota: ratioSinCuota == null ? null : Number(ratioSinCuota.toFixed(3)),
    ratioLista: ratioLista == null ? null : Number(ratioLista.toFixed(3)),
    eurosBajoBase: n === 0 ? null : Math.round(eurosBajoBase),
    umbral, minReservas, peores,
  }
}
