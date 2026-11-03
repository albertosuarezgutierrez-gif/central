// lib/sivra/pricing-guardia.ts — lógica PURA (sin BD ni red) del guardián de sub-mercado.
//
// Contexto (20/07/2026): una reserva de Luxury Busto entró a ~110€/noche cuando el mercado real
// rondaba ~160-185€. Causa: el precio vivo del piso llevaba semanas anclado a un valor viejo y
// NADIE se enteró — el detector de "precio bajo" existente comparaba contra el escenario 'normal'
// (datos Serper baratos, p50 ~117€) en vez del mercado real por piso (`prop_<piso>`, conector),
// así que un piso 30% por debajo de su mercado real parecía correcto.
//
// Estas funciones deciden, con umbrales conservadores y mínimos de muestra, si algo merece alerta.
// Se mantienen puras para poder testearlas con `node --test` sin tocar la BD.

export type SubMercadoInput = {
  /** nº de fechas futuras donde el precio vivo del piso CASA con una fecha que tiene comps de mercado */
  datesMatched: number
  /** de esas, en cuántas el precio vivo va por debajo del umbral respecto al p50 de mercado de ESE día */
  datesSub: number
  /** media del precio vivo sobre las fechas casadas */
  avgLive: number
  /** media del p50 de mercado sobre las fechas casadas */
  avgP50: number
}

export type SubMercadoOpts = {
  /** mínimo de fechas casadas para fiarnos (si hay menos, no evaluamos: mejor callar que falsa alarma) */
  minDates?: number
  /** fracción MÍNIMA de fechas casadas que deben ir por debajo (0.5 = la mayoría) */
  ratio?: number
  /** la MEDIA del piso debe ir al menos este % por debajo del mercado para disparar */
  marginPct?: number
}

export type SubMercadoResult = {
  alerta: boolean
  /** cuánto va la media del piso por debajo del mercado, en % (negativo = por debajo) */
  diffPct: number
  motivo: string
}

/**
 * ¿El precio VIVO del piso va sistemáticamente por debajo de su mercado real?
 *
 * Conservador a propósito (el pecado capital aquí es la FALSA alarma, lección 19/07): las fechas que
 * casan con mercado son solo las que el conector barrió (a menudo findes/eventos de valor alto, donde
 * el vivo está POR ENCIMA), así que exigimos TRES cosas a la vez: suficientes fechas casadas, que la
 * MEDIA vaya de verdad por debajo del mercado (no solo unas pocas fechas sueltas), y que la MAYORÍA de
 * las fechas casadas estén por debajo. Solo cuando el barrido de mercado se amplía (sesión semanal del
 * agente) este chequeo cubre meses enteros como septiembre.
 */
export function decidirSubMercado(i: SubMercadoInput, o: SubMercadoOpts = {}): SubMercadoResult {
  const minDates = o.minDates ?? 4
  const ratio = o.ratio ?? 0.5
  const marginPct = o.marginPct ?? 10
  const diffPct = i.avgP50 > 0 ? ((i.avgLive - i.avgP50) / i.avgP50) * 100 : 0
  const share = i.datesMatched > 0 ? i.datesSub / i.datesMatched : 0
  if (i.datesMatched < minDates) {
    return { alerta: false, diffPct, motivo: `pocas fechas con mercado (${i.datesMatched}<${minDates})` }
  }
  if (diffPct > -marginPct) {
    return { alerta: false, diffPct, motivo: `la media no va por debajo del mercado (${Math.round(diffPct)}%)` }
  }
  if (share < ratio) {
    return { alerta: false, diffPct, motivo: `solo ${i.datesSub}/${i.datesMatched} fechas por debajo (<${Math.round(ratio * 100)}%)` }
  }
  return {
    alerta: true,
    diffPct,
    motivo: `${i.datesSub}/${i.datesMatched} fechas por debajo; media ${Math.round(i.avgLive)}€ vs mercado ${Math.round(i.avgP50)}€`,
  }
}

export type ReservaBajaInput = {
  /** ADR bruto realizado de la reserva (importe bruto / noches) */
  adr: number
  /** p50 de mercado real del piso (conector), € por noche */
  marketP50: number
  /** nº de comps que forman ese p50 */
  comps: number
  /**
   * true = el p50 es el de la FECHA de la reserva; false = es el p50 MEZCLADO del piso (todas las
   * fechas), el respaldo cuando la fecha no tiene comps. Obligatorio a propósito: el llamador tiene
   * que decir de dónde sale el número, porque con el mezclado NO se alerta (ver la función).
   */
  fechaEspecifica: boolean
  /**
   * true = la fecha de la reserva tiene un evento activo (no descartado) o un prior estacional > 1.
   * Son justo las noches con menos comps propios, donde el p50 mezclado NO es un mal patrón (el
   * mezclado queda por DEBAJO de lo que vale esa noche) y una reserva barata sí lo es. Con el mezclado
   * y esta marca, se alerta. Ausente/false = como antes (informativa).
   */
  fechaSensible?: boolean
}

export type ReservaBajaOpts = {
  /** fracción por debajo del mercado a partir de la cual avisamos (0.25 = 25% por debajo) */
  umbral?: number
  /** comps mínimos para fiarnos del p50 */
  minComps?: number
}

export type ReservaBajaResult = {
  alerta: boolean
  diffPct: number
  /**
   * true = habría saltado, pero contra el p50 MEZCLADO del piso: se cuenta como informativo, no se
   * alerta. Con el mezclado no se sabe si la reserva fue barata o si la fecha es de temporada baja.
   */
  informativa?: boolean
}

/**
 * ¿Una reserva recién entrada salió notablemente por debajo del mercado real del piso?
 * Solo evalúa si hay p50 fiable (≥ minComps). Umbral holgado para no marcar el descuento
 * normal de canal (Genius/móvil ~10-15%): avisa a partir del 25% por debajo.
 *
 * 🚨 Solo ALERTA contra el p50 de la FECHA (28/10/2026). El mezclado del piso promedia temporada alta
 * y baja: Duplex 28/01 y 04/02/2027 salieron −42 % y −45 % contra un mezclado de 159 € cuando el
 * mercado de las fechas vecinas era 104-118 €. Eso no es una reserva barata, es enero. Sin p50 de la
 * fecha el resultado es `informativa` (se cuenta, no se avisa): «no se sabe» no es «va mal».
 * Excepción: `fechaSensible` (evento activo o prior estacional > 1) sí alerta contra el mezclado.
 */
export function decidirReservaBaja(i: ReservaBajaInput, o: ReservaBajaOpts = {}): ReservaBajaResult {
  const umbral = o.umbral ?? 0.25
  const minComps = o.minComps ?? 25
  if (i.marketP50 <= 0 || i.comps < minComps || i.adr <= 0) return { alerta: false, diffPct: 0 }
  const diffPct = ((i.adr - i.marketP50) / i.marketP50) * 100
  const bajo = diffPct <= -umbral * 100
  if (i.fechaEspecifica !== true) {
    // Evento activo o temporada alta: el mezclado se queda corto para esa noche, así que una reserva
    // por debajo de él es barata de verdad.
    if (i.fechaSensible === true) return { alerta: bajo, diffPct }
    return { alerta: false, diffPct, informativa: bajo }
  }
  return { alerta: bajo, diffPct }
}

/**
 * ¿POR QUÉ salió barata la reserva? Son dos averías distintas y se arreglan en sitios distintos:
 *  · `precio`    → se vendió a (casi) lo que publicábamos: el barato es NUESTRO precio, no la reserva.
 *                  Se revisa el motor/suelo de esas fechas; la reserva no tiene nada de raro.
 *  · `descuento` → el huésped pagó bastante menos de lo publicado: promos de canal apiladas
 *                  (early booker, Genius, móvil, ofertas de Agoda/Expedia) o markup mal calibrado.
 *  · `null`      → no consta el precio publicado al reservar: NO se afirma ninguna de las dos.
 * Medido 26/09/2026 (90 días): Booking cobra de mediana 0,86-0,93× lo publicado (Genius normal);
 * 14 de 15 avisos de esa semana eran `precio`, y el texto les decía «revisa la reserva».
 */
export function causaReservaBaja(adr: number, precioPublicado: number | null | undefined, umbralDescuento = 0.8):
  'precio' | 'descuento' | null {
  const pub = Number(precioPublicado)
  if (!Number.isFinite(pub) || pub <= 0 || !(adr > 0)) return null
  return adr / pub < umbralDescuento ? 'descuento' : 'precio'
}
