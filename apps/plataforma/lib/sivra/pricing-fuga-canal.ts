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
//
// 🔄 LA MISMA TARDE (07/09/2026) Alberto cambió el extranet y la lista dejó de ser la de arriba:
//   · Basic Deal 12 % → fuera. Mobile rate 10 % → fuera. Genius nivel 2-3 15 % → fuera.
//   · Se queda: Genius 10 % (todos los niveles) y los country rates del 10 % (EEA/UK/US, no
//     reembolsable, ≥3 noches). Tarifa semanal/mensual pasan a no reembolsable con 7/28 noches.
//   Con eso `channel_markup` de House se puso a mano en 1,20 (= Standard Rate) y las mediciones
//   del escaparate anteriores se apartaron (`pricing_escaparate.portal = 'booking_basic_deal'`)
//   para que el calibrador no ajuste una recta sobre dos regímenes. Consecuencia para ESTE
//   módulo: la pila ACEPTADA es Genius × country = 0,90 × 0,90 = 0,81 de la lista, y el umbral
//   por defecto baja a 0,80 — por debajo hay un descuento que nadie ha pedido. Límite conocido:
//   un 10 % suelto sobre huéspedes que no apilan (0,81 → 0,90 × 0,90) queda en el borde y no se
//   ve; lo que sí se ve es cualquier pila como la de arriba (0,67-0,77). La reserva 154638741,
//   con la lista de hoy, habría pagado 565,20€ + 585,90€ = 1.151,10€ + limpieza (+33,6 %).

// 🪞 Y LA LISTA NO ES UNA RECTA en todos los pisos (24/09/2026, falsa alarma en Luxury Busto y Busto
// Reform). Su escaparate de Booking tiene DOS regímenes según la antelación, cada uno exacto (R² =
// 1,000 en los dos, 45 días de ventanas):
//
//   piso           antelación ≤ 6 días        antelación ≥ 7 días
//   Busto Reform   1,109 × base + 26,8€       0,994 × base + 28,2€
//   Luxury Busto   1,107 × base + 33,6€       0,994 × base + 34,9€
//
// `pricing_settings` guarda UNA recta ajustada sobre las dos mezcladas (0,987 × base + 64,1€ en
// Luxury): la pendiente sale en medio y el exceso se lo come la ordenada. Y aquí la ordenada se
// resta como si fuera la limpieza, así que a una reserva de 2 noches le quitaba 15€/noche que el
// huésped sí pagó por dormir: Luxury salía a 0,72 cuando, contra su lista real, está en 0,82.
// Por eso la lista se mide en el escaparate POR TRAMO de antelación (`canalPorAntelacion`) y la
// recta del motor solo es el último recurso cuando un tramo no tiene ventanas suficientes.

import { ajusteCanal, type ParametrosCanal, type VentanaEscaparate } from './pricing-canal.ts'

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
  /** días entre la reserva y el check-in: decide contra qué tramo de la lista se juzga */
  antelacionDias?: number | null
}

export type EstadoFuga = 'sin_reservas' | 'muestra_corta' | 'ok' | 'fuga'

export interface ReservaJuzgada {
  reservationId: string
  checkIn?: string
  nights: number
  /** (bruto − limpieza) / noches: lo que el huésped pagó por DORMIR cada noche */
  cobradoNoche: number
  /** base × markup del tramo de antelación: la lista pública (sin Genius, sin móvil, sin limpieza) */
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
  /** por debajo de este ratio (mediana) el estado es `fuga`; por defecto `UMBRAL_FUGA` */
  umbral?: number
  /** cuántas reservas listar en `peores` */
  maxPeores?: number
  /**
   * Lista de las reservas de ÚLTIMA HORA (antelación ≤ `DIAS_ULTIMA_HORA`). Sin ella, o sin
   * antelación conocida, se juzga todo contra `canal`.
   */
  canalUltimaHora?: ParametrosCanal
}

/** Escaparate/base por encima de esto no es una tarifa del canal (House, el más caro, va a ~1,5×). */
const RATIO_VENTANA_MAX = 3

/** Última antelación (días) que el escaparate de Booking pone en el tramo de última hora. */
export const DIAS_ULTIMA_HORA = 6

export type VentanaConAntelacion = VentanaEscaparate & { antelacionDias: number }

export interface CanalPorAntelacion {
  antelacion: ParametrosCanal
  ultimaHora: ParametrosCanal
  /** de dónde sale cada tramo: `medido` = recta del escaparate de ese tramo; `motor` = pricing_settings */
  fuente: { antelacion: 'medido' | 'motor'; ultimaHora: 'medido' | 'motor' }
}

/**
 * La lista pública de cada tramo de antelación, medida en el escaparate. Un tramo sin ajuste fiable
 * (`ajusteCanal` ≠ `medido`) cae a la recta del motor, y se dice (`fuente`).
 */
export function canalPorAntelacion(
  ventanas: VentanaConAntelacion[],
  opts: { aforo: number; portal?: string; motor: ParametrosCanal },
): CanalPorAntelacion {
  const tramo = (ultimaHora: boolean): [ParametrosCanal, 'medido' | 'motor'] => {
    const vs = ventanas.filter(v => (Number(v.antelacionDias) <= DIAS_ULTIMA_HORA) === ultimaHora &&
      // Una ventana a 13× la base (Busto Reform, 25/03/2027: 3.329€ sobre 250€) no es el canal: es
      // el portal enseñando otra cosa. Una sola hunde el R² del tramo y lo manda a la recta del motor.
      !(v.baseTotal != null && v.baseTotal > 0 && v.precioTotal / v.baseTotal > RATIO_VENTANA_MAX))
    const a = ajusteCanal(vs, { aforo: opts.aforo, portal: opts.portal })
    if (a.estado !== 'medido' || a.markup == null || a.cuotaFija == null) return [opts.motor, 'motor']
    return [{ markup: a.markup, cuotaFija: a.cuotaFija, nochesRef: opts.motor.nochesRef }, 'medido']
  }
  const [antelacion, fa] = tramo(false)
  const [ultimaHora, fu] = tramo(true)
  return { antelacion, ultimaHora, fuente: { antelacion: fa, ultimaHora: fu } }
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Pila de descuentos ACEPTADA en el extranet (07/09/2026): Genius 10 % × country rate 10 % = 0,81.
 * El umbral va justo debajo: la mediana solo cae de ahí si alguien apila algo más.
 */
export const PILA_ACEPTADA = { genius: 0.10, countryRate: 0.10 } as const
export const UMBRAL_FUGA = Number(((1 - PILA_ACEPTADA.genius) * (1 - PILA_ACEPTADA.countryRate) - 0.01).toFixed(2))

export function fugaCanal(reservas: ReservaCobrada[], canal: ParametrosCanal, o: FugaCanalOpts = {}): FugaCanal {
  const minReservas = o.minReservas ?? 5
  const umbral = o.umbral ?? UMBRAL_FUGA
  const maxPeores = o.maxPeores ?? 3
  const params = (c: ParametrosCanal) => ({
    markup: Number(c.markup) > 0 ? Number(c.markup) : 1,
    cuota: Number(c.cuotaFija) > 0 ? Number(c.cuotaFija) : 0,
  })
  const lejos = params(canal)
  const cerca = o.canalUltimaHora ? params(o.canalUltimaHora) : lejos

  const juzgadas: ReservaJuzgada[] = []
  let nSinBase = 0
  let nBrutoRaro = 0
  let eurosBajoLista = 0
  for (const r of reservas) {
    const nights = Number(r.nights)
    if (!(nights >= 1) || !(r.brutoTotal > 0)) continue
    if (r.baseMedia == null || !(r.baseMedia > 0)) { nSinBase++; continue }
    const { markup, cuota } = r.antelacionDias != null && r.antelacionDias <= DIAS_ULTIMA_HORA ? cerca : lejos
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
