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
}

/**
 * ¿Una reserva recién entrada salió notablemente por debajo del mercado real del piso?
 * Solo evalúa si hay p50 fiable (≥ minComps). Umbral holgado para no marcar el descuento
 * normal de canal (Genius/móvil ~10-15%): avisa a partir del 25% por debajo.
 */
export function decidirReservaBaja(i: ReservaBajaInput, o: ReservaBajaOpts = {}): ReservaBajaResult {
  const umbral = o.umbral ?? 0.25
  const minComps = o.minComps ?? 25
  if (i.marketP50 <= 0 || i.comps < minComps || i.adr <= 0) return { alerta: false, diffPct: 0 }
  const diffPct = ((i.adr - i.marketP50) / i.marketP50) * 100
  return { alerta: diffPct <= -umbral * 100, diffPct }
}
