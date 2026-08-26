// lib/sivra/mercado-ventanas.ts — QUÉ fechas barre el mercado, y por qué.
//
// POR QUÉ (01/08/2026). El barrido mensual (`mercado/sweep`) miraba el PRIMER VIERNES de cada mes y
// nada más. Ocho fechas al año y media, todas elegidas por el calendario gregoriano: el barrido nunca
// veía la Feria, ni la Semana Santa, ni los tres días de Karol G — justo las noches que el motor
// tarifica al triple y donde equivocarse cuesta de verdad. Medido ese día: de 5 a 7 fechas por mes en
// el corpus, y octubre —el mejor mes de Sevilla— con su último barrido de hacía 15 días.
//
// El daño no era solo tarificar a ciegas: los dos centinelas que vigilan los eventos (#7 «evento sin
// respaldo de mercado» y #8 «el mercado sube y no sabemos por qué») EXIGEN comps de esa fecha, así que
// sin barrido de las fechas de evento se quedaban en `evaluado:false` para siempre. Catalogábamos
// eventos que nadie comprobaba nunca.
//
// Ahora el barrido tiene dos patas:
//   · la BASE mensual (un finde por mes) → la línea de temporada, que es para lo que nació;
//   · las fechas de EVENTO → lo que el motor va a tarificar caro, para poder verificarlo.
//
// Un bloque de evento (la Feria son 7 noches seguidas) gasta UNA ventana, no siete: se barre la noche
// de mayor factor del bloque. Y se priorizan los eventos MÁS CERCANOS, que son los que ya se están
// vendiendo — un error en la Feria de dentro de 8 meses todavía da tiempo a corregirlo.

export type EventoFecha = {
  /** YYYY-MM-DD */
  fecha: string
  factor: number
  nombre?: string
  /**
   * true = evento CONFIRMADO (calendario del repo o `pricing_eventos_auto` con estado confirmado).
   * Importa para la COLA (13/08/2026): una fecha de evento confirmado sin medir está CONGELADA por
   * el motor a un precio posiblemente falso — medirla es lo que la descongela. Un previsto no
   * congela nada, así que no gasta ventana prioritaria en una apuesta.
   */
  confirmado?: boolean
}

export type Ventana = {
  /** YYYY-MM-DD */
  checkin: string
  /** YYYY-MM-DD */
  checkout: string
  /** por qué se barre esta fecha */
  motivo: 'mes' | 'evento'
  /** nombre del evento, cuando lo hay (para el informe de la pasada) */
  etiqueta?: string
  /**
   * Prioridad de la ventana (0 = lo primero que hay que barrer). El barrido tiene presupuesto de
   * tiempo, así que el ORDEN es parte del contrato: si la pasada se corta, lo que sobrevive tiene
   * que ser lo importante. Ver la nota del reparto por rondas en `ventanasDelBarrido`.
   */
  ronda: number
  /** el evento de esta ventana está CONFIRMADO (ver `EventoFecha.confirmado`) */
  eventoConfirmado?: boolean
  /**
   * Factor de evento de la fecha (1 = ninguno). Viaja hasta el plan porque la cola de urgencia lo
   * necesita para reservar sitio a los bloques CAROS aunque estén lejos: sin él, la cola se ordena
   * solo por cercanía y una Navidad o una Feria sin medir se quedan detrás de 40 noches de
   * septiembre (ver `planDeVentanas`).
   */
  factor?: number
}

export type ConsultaVentana = {
  via: 'abierta' | 'mes' | 'booking'
  q: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «2026-11-13» → «noviembre 2026» (para la consulta de refuerzo por mes). */
export function mesEnTexto(iso: string): string {
  return `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/**
 * Consultas de una ventana, en orden de intento (la siguiente solo se lanza si la anterior no
 * resuelve, y a partir de la segunda pagan el cupo de refuerzo):
 *   1. ABIERTA con la fecha ISO → es la que trae mercado (04/08/2026: 20 de 20 aciertos contra
 *      0 de 100 del operador `site:`) Y distingue la fecha (medianas 305€ oct · 199€ dic · 104€ ene
 *      ese mismo día). Pero el token de fecha es una LOTERÍA por fecha concreta: el 05/08/2026 la
 *      ventana de noviembre entera volvió con `organic: []` en los 4 aforos (8 búsquedas contando
 *      refuerzos) mientras feb y mar de 2027 —más lejanas— traían comps. No es distancia ni cuota:
 *      para ESA fecha Google no casa nada.
 *   2. MES EN TEXTO («noviembre 2026») — SOLO para ventanas de base. La línea de temporada es
 *      mensual (el motor agrega por bucket de mes), así que un comparable «de noviembre» es
 *      exactamente lo que ese bucket necesita cuando la fecha exacta no casa. Para una ventana de
 *      EVENTO sería mentir: el comp de un evento tiene que ser de SU fecha (la mediana del mes
 *      diluiría el premio de la Feria), así que ahí no se ofrece.
 *   3. `site:booking.com` + fechas → la consulta original. Muda desde el 02/08/2026 (0 de 106 en
 *      dos pasadas); se conserva por si Google vuelve a indexar así.
 */
export function consultasDeVentana(
  checkin: string, checkout: string, aforo: number, motivo: 'mes' | 'evento',
): ConsultaVentana[] {
  const consultas: ConsultaVentana[] = [
    { via: 'abierta', q: `apartamentos turísticos Sevilla centro para ${aforo} personas ${checkin} precio por noche euros booking` },
  ]
  if (motivo !== 'evento') {
    consultas.push({ via: 'mes', q: `apartamentos turísticos Sevilla centro para ${aforo} personas ${mesEnTexto(checkin)} precio por noche euros booking` })
  }
  consultas.push({ via: 'booking', q: `apartamentos turísticos Sevilla centro ${checkin} ${checkout} ${aforo} personas site:booking.com precio noche` })
  return consultas
}

export type VentanasOpts = {
  /** meses vista de la base mensual */
  mesesBase?: number
  /**
   * Fechas de muestra por mes. Por debajo de 3 el motor NO puede usar el bucket mensual
   * (`MIN_FECHAS_MES` en `pricing/apply`) y ese mes se tarifica con el ancla global.
   */
  fechasPorMes?: number
  /** cuántas ventanas de evento como mucho (cada una cuesta 1 búsqueda por aforo distinto) */
  maxEventos?: number
  /** a partir de qué factor una fecha cuenta como evento */
  factorMinimo?: number
  /** noches de cada ventana */
  noches?: number
  /** horizonte en días: más allá no se barre (el motor tampoco tarifica) */
  horizonteDias?: number
}

/**
 * A partir de qué factor una fecha cuenta como EVENTO. Vive aquí y se exporta porque hay dos
 * consumidores que TIENEN que coincidir: el que decide qué fechas son de evento para el plan, y el
 * que decide qué fechas NO suman al bucket mensual (`mesesSinBucket`). Si divergen, se marcaría
 * como «mide aquí para desatascar el mes» una noche que el motor va a excluir del bucket igual.
 */
export const FACTOR_EVENTO_MINIMO = 1.15

const DIA_MS = 86_400_000

function aFecha(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function sumarDias(iso: string, n: number): string {
  return fmt(new Date(aFecha(iso).getTime() + n * DIA_MS))
}
function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round((aFecha(hastaIso).getTime() - aFecha(desdeIso).getTime()) / DIA_MS)
}

/**
 * Fecha de muestra nº `orden` del mes a `m` meses vista. `orden` 0 = primer VIERNES (el que se ha
 * barrido siempre; se mantiene para no mover la serie histórica).
 *
 * 🚨 POR QUÉ HAY MÁS DE UNA (01/08/2026, caso Luxury 6-nov). El motor descarta el bucket de mercado
 * de un mes si no tiene comps de al menos `MIN_FECHAS_MES` (3) fechas DISTINTAS — y con una sola
 * ventana mensual eso era inalcanzable por definición. Medido ese día, por piso y mes: House tenía
 * 1 fecha en oct, nov y dic; Luxury 1 en noviembre; el Dúplex 1 en oct, nov y dic. O sea que la
 * mayoría de los meses caían al ANCLA GLOBAL —construida con el último barrido, dominado por las
 * fechas cercanas y más baratas— en vez de con su propio mercado. Consecuencia real: el motor bajó
 * el viernes 6-nov de Luxury a 122€ de base y esa noche se vendió cuatro horas después, con
 * comparables de ESE día entre 123€ y 212€.
 *
 * La mezcla de días NO es cosmética: el bucket del mes se aplica a TODOS los días de ese mes, así
 * que tiene que parecerse al mes, no a su mejor viernes. Se replica la composición que ya tenían
 * los meses que sí funcionaban (agosto y septiembre: ~2/3 fin de semana, 1/3 entre semana):
 *   orden 0 → primer viernes · orden 1 → segundo sábado · orden 2 → CUARTO martes.
 * Con solo findes el bucket sobrevaloraría el mes entero; con solo entre semana, lo hundiría.
 *
 * 🚨 El orden 2 pasó de SEGUNDO a CUARTO martes el 18/08/2026, y no es un detalle: los tres
 * órdenes caían en la PRIMERA QUINCENA (días 1-14), así que el corpus no tenía una sola medición
 * de la segunda mitad de ningún mes salvo que hubiera evento. Medido ese día en `market_rates`:
 * las fechas fiables de diciembre eran 5, 11, 12, 15 y 18 — y con esas cinco el motor decidía el
 * precio de Nochebuena y de Fin de Año. Cambia el reparto en el calendario, NO la composición
 * (siguen siendo 2 findes + 1 entre semana) ni el coste (siguen siendo 3 ventanas por mes).
 */
export function findeDelMes(hoyIso: string, m: number, orden = 0): string {
  const d = aFecha(hoyIso)
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + m)
  // [día de la semana buscado, cuántas veces hay que encontrarlo]
  const patron: [number, number][] = [[5, 1], [6, 2], [2, 4]]
  const [diaSemana, ocurrencia] = patron[orden] ?? patron[0]
  let vistas = 0
  while (true) {
    if (d.getUTCDay() === diaSemana) { vistas++; if (vistas === ocurrencia) break }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return fmt(d)
}

/**
 * Agrupa fechas de evento CONTIGUAS en bloques y devuelve, de cada bloque, la de mayor factor
 * (empate → la primera). La Feria entera gasta una sola ventana.
 */
export function picosDeEvento(eventos: EventoFecha[], factorMinimo = FACTOR_EVENTO_MINIMO): EventoFecha[] {
  const dignos = eventos
    .filter(e => Number(e.factor) >= factorMinimo)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (!dignos.length) return []

  const picos: EventoFecha[] = []
  let bloque: EventoFecha[] = [dignos[0]]

  const cerrar = () => {
    let mejor = bloque[0]
    for (const e of bloque) if (Number(e.factor) > Number(mejor.factor)) mejor = e
    // El bloque cuenta como CONFIRMADO si CUALQUIERA de sus noches lo está: la ventana representa
    // al bloque entero, y basta una noche congelada para que medirlo sea urgente (13/08/2026).
    const confirmado = bloque.some(e => e.confirmado === true)
    picos.push(confirmado && mejor.confirmado !== true ? { ...mejor, confirmado: true } : mejor)
  }

  for (let i = 1; i < dignos.length; i++) {
    // Misma fecha repetida (dos fuentes) o día siguiente ⇒ sigue el mismo bloque.
    const salto = diasEntre(dignos[i - 1].fecha, dignos[i].fecha)
    if (salto <= 1) bloque.push(dignos[i])
    else { cerrar(); bloque = [dignos[i]] }
  }
  cerrar()
  return picos
}

/**
 * Ventanas a barrer en una pasada. La base mensual va SIEMPRE (es la línea de temporada); las de
 * evento se añaden por cercanía hasta el tope, sin repetir una fecha que ya cubre la base.
 */
export function ventanasDelBarrido(
  hoyIso: string,
  eventos: EventoFecha[],
  opts: VentanasOpts = {},
): Ventana[] {
  const mesesBase = opts.mesesBase ?? 8
  const maxEventos = opts.maxEventos ?? 6
  const factorMinimo = opts.factorMinimo ?? FACTOR_EVENTO_MINIMO
  const noches = opts.noches ?? 2
  const horizonteDias = opts.horizonteDias ?? 365

  const fechasPorMes = Math.max(1, opts.fechasPorMes ?? 3)

  const vistas = new Set<string>()
  // Una lista por RONDA. El orden final las concatena, y ese orden ES el contrato con el barrido:
  //   ronda 0 → una fecha de CADA mes (la línea de temporada; sin esto no hay pasada que valga)
  //   ronda 1 → las fechas de EVENTO (lo que el motor va a tarificar caro, hay que poder verificarlo)
  //   ronda 2+ → 2ª y 3ª fecha de cada mes, que son las que hacen ELEGIBLE el bucket mensual
  // Así, si el presupuesto de tiempo corta la pasada, se pierde profundidad de bucket —recuperable
  // mañana— y nunca la temporada ni los eventos.
  // 🚨 Una fecha de muestra NO puede caer en día de evento. El bucket mensual del motor EXCLUYE las
  // fechas de evento a propósito (si no, la Feria arrastraría la mediana de todo abril), así que una
  // muestra que coincide con un evento no suma al bucket: el mes se quedaría otra vez corto de
  // fechas y volvería al ancla global — justo lo que esto viene a arreglar. Cuando choca, la muestra
  // se corre una semana (mismo día de la semana, para no cambiar la composición finde/entre semana).
  const fechasEvento = new Set(
    eventos.filter(e => Number(e.factor) >= factorMinimo).map(e => e.fecha),
  )
  // 🚨 La búsqueda de hueco se queda DENTRO DEL MES y prueba también hacia atrás (18/08/2026).
  // La versión anterior corría la muestra +7 días hasta tres veces, y con un bloque de evento
  // largo al final del mes eso la sacaba del mes entero: la muestra del 22-dic (cuarto martes)
  // saltaba a 29-dic, 5-ene y 12-ene, con lo que diciembre se quedaba con DOS fechas y perdía el
  // bucket mensual —justo el fallo que las tres muestras vinieron a cerrar—. Se conserva el mismo
  // día de la semana para no cambiar la composición finde/entre semana.
  const muestraDelMes = (m: number, orden: number): string => {
    const base = findeDelMes(hoyIso, m, orden)
    if (!fechasEvento.has(base)) return base
    const mes = base.slice(0, 7)
    for (const salto of [7, -7, 14, -14, 21, -21]) {
      const f = sumarDias(base, salto)
      if (f.slice(0, 7) === mes && !fechasEvento.has(f)) return f
    }
    // Mes copado por eventos (Semana Santa + Feria en abril, p. ej.): se barre la fecha original.
    // No suma al bucket mensual —el motor excluye las fechas de evento— pero medir esa noche sigue
    // valiendo para el ancla por fecha, que es lo que tarifica el día caro.
    return base
  }

  const rondasBase: Ventana[][] = []
  for (let orden = 0; orden < fechasPorMes; orden++) {
    const ronda: Ventana[] = []
    for (let m = 1; m <= mesesBase; m++) {
      const checkin = muestraDelMes(m, orden)
      if (vistas.has(checkin)) continue
      vistas.add(checkin)
      ronda.push({ checkin, checkout: sumarDias(checkin, noches), motivo: 'mes', ronda: 0 })
    }
    rondasBase.push(ronda)
  }

  const eventoVentanas: Ventana[] = []
  if (maxEventos > 0) {
    const candidatos = picosDeEvento(eventos, factorMinimo)
      .filter(e => {
        const d = diasEntre(hoyIso, e.fecha)
        return d >= 0 && d <= horizonteDias
      })
      // Lo más cercano primero: es lo que ya se está vendiendo.
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    for (const e of candidatos) {
      if (eventoVentanas.length >= maxEventos) break
      if (vistas.has(e.fecha)) continue
      vistas.add(e.fecha)
      eventoVentanas.push({
        checkin: e.fecha,
        checkout: sumarDias(e.fecha, noches),
        motivo: 'evento',
        etiqueta: e.nombre,
        ronda: 1,
        eventoConfirmado: e.confirmado === true,
        factor: Number(e.factor),
      })
    }
  }

  const ordenadas = [rondasBase[0] ?? [], eventoVentanas, ...rondasBase.slice(1)]
  return ordenadas.flatMap((lista, i) => lista.map(v => ({ ...v, ronda: i })))
}

/**
 * Ventanas POR FECHA para los eventos CONFIRMADOS, sin colapsar bloques. SOLO para el plan del
 * conector de Booking — el sweep de Serper sigue con `ventanasDelBarrido` a secas.
 *
 * POR QUÉ (14/08/2026, cazado en la primera pasada real de la guarda 🧊). El colapso por bloques
 * («la Feria entera gasta una ventana») es correcto para la línea de temporada, pero choca con la
 * congelación, que es POR FECHA EXACTA: el bloque 18-21 sep lo representaba el 20-sep
 * (Sevilla-Barcelona, mayor factor), Booking midió el 20 → el bloque dejó de estar virgen → las
 * noches 18 y 19 de la Bienal quedaban CONGELADAS PARA SIEMPRE, porque sus comps propios no se
 * pedían nunca. El descongelado automático asumía «una noche congelada = una ventana» y el bloque
 * lo rompía.
 *
 * Devuelve una ventana por cada fecha confirmada ≥`factorMinimo` dentro del horizonte que NO esté
 * ya en `plan` (las del plan mandan: traen su etiqueta de bloque). El coste está acotado por el
 * tope por pasada de siempre (`?max=`): esto añade CANDIDATAS, no consultas — y `planDeVentanas`
 * ya prioriza las vírgenes confirmadas y hunde las medidas, así que solo se consulta lo que la
 * congelación necesita, unas pocas por pasada.
 */
export function ventanasDeConfirmadosPorFecha(
  hoyIso: string,
  eventos: EventoFecha[],
  plan: Ventana[],
  opts: Pick<VentanasOpts, 'factorMinimo' | 'noches' | 'horizonteDias'> = {},
): Ventana[] {
  const factorMinimo = opts.factorMinimo ?? FACTOR_EVENTO_MINIMO
  const noches = opts.noches ?? 2
  const horizonteDias = opts.horizonteDias ?? 365

  const enPlan = new Set(plan.map(v => v.checkin))
  const extra: Ventana[] = []
  const vistas = new Set<string>()
  for (const e of eventos) {
    if (e.confirmado !== true) continue
    if (!(Number(e.factor) >= factorMinimo)) continue
    const d = diasEntre(hoyIso, e.fecha)
    if (d < 0 || d > horizonteDias) continue
    if (enPlan.has(e.fecha) || vistas.has(e.fecha)) continue
    vistas.add(e.fecha)
    extra.push({
      checkin: e.fecha,
      checkout: sumarDias(e.fecha, noches),
      motivo: 'evento',
      etiqueta: e.nombre,
      ronda: 1,
      eventoConfirmado: true,
      factor: Number(e.factor),
    })
  }
  return extra.sort((a, b) => a.checkin.localeCompare(b.checkin))
}
