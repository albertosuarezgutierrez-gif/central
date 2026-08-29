// lib/sivra/mercado-cobertura.ts — QUÉ ventanas pide medir la rutina de Booking, y en qué orden.
//
// POR QUÉ (06/08/2026). El barrido por búsqueda web quedó mecánicamente perfecto (120/120 ventanas
// el 06/08) y aun así NO mide temporada: los precios que devuelven los snippets son de anuncio y
// vienen SIN fecha, así que el mismo comparable sale al mismo precio en agosto, en noviembre y en
// marzo (Vincci ≈305€, Smartr ≈93€, Genteel ≈259€ los tres meses). Contrastado el mismo día con el
// conector de Booking: esas mismas propiedades valen ~160€/noche en noviembre y ~650€/noche en la
// Feria. La fuente que sí distingue la fecha es el conector, y a un conector se le pregunta desde
// una SESIÓN (una rutina de Claude), no desde un cron.
//
// Una sesión no puede medir las 120 ventanas del plan: cada consulta al conector devuelve una
// respuesta grande y el contexto es finito. Por eso la rutina no decide qué mirar — lo pregunta, y
// este módulo responde con las ventanas cuyo corpus FIABLE está más viejo. Consecuencias buscadas:
//   · la cobertura se completa en 3-4 pasadas y luego se auto-refresca por antigüedad;
//   · si una pasada se corta a la mitad, la siguiente retoma justo por donde iba (sin estado);
//   · el plan de fechas sigue siendo UNO (`ventanasDelBarrido`), no una copia en un prompt.
//
// Módulo PURO: sin Prisma, sin `@/`, testeable con `node --test`.

import type { Ventana } from './mercado-ventanas.ts'

/** Fuentes de `market_rates.fuente`. Ver `prisma/sql/2026-08-06_market_rates_fuente.sql`. */
export type FuenteComparable = 'serper' | 'booking_mcp' | 'manual'

/**
 * Solo estas fuentes CUENTAN como «esta fecha está medida». `serper` queda fuera a propósito: sus
 * precios no distinguen la fecha, así que tener 20 comps suyos de noviembre no es saber cuánto
 * cuesta noviembre — es la trampa que este trabajo viene a cerrar.
 */
export const FUENTES_FIABLES: FuenteComparable[] = ['booking_mcp', 'manual']

/** Última medición fiable de una ventana (fecha × aforo). `null` = nunca se ha medido. */
export type CoberturaVentana = {
  /** YYYY-MM-DD */
  checkin: string
  aforo: number
  /** YYYY-MM-DD del último `search_date` con fuente fiable, o null si no hay ninguno. */
  ultimaMedicion: string | null
  /** comps fiables vigentes de esa ventana (para poder decir «medida pero con muestra pobre») */
  comps: number
}

export type VentanaPedida = {
  /** YYYY-MM-DD */
  checkin: string
  /** YYYY-MM-DD */
  checkout: string
  aforo: number
  /** pisos que comparten ese aforo — el comparable se guarda para todos ellos */
  pisos: string[]
  motivo: 'mes' | 'evento'
  etiqueta?: string
  /** 0 = ronda base (línea de temporada). Ver `mercado-ventanas.ts`. */
  ronda: number
  /** ventana de evento CONFIRMADO (su precio está congelado mientras no se mida) */
  eventoConfirmado?: boolean
  /** factor de evento de la fecha (1 = ninguno). Decide la RESERVA de alto valor, ver abajo. */
  factor: number
  /** días desde la última medición fiable; `null` = nunca medida (lo más urgente) */
  diasSinMedir: number | null
  comps: number
  /**
   * El MES de esta fecha no llega a las fechas normales que el motor exige para fiarse de él
   * (`MIN_FECHAS_BUCKET`). Ver `mesesSinBucket`: mientras sea `true`, medir aquí vale mucho más
   * que refrescar un mes que ya tiene diez fechas.
   */
  mesCorto?: boolean
}

/**
 * Recorte del plan para una pasada CONCRETA. Nace de una petición manual (08/08/2026): «mide solo
 * la 2ª y 3ª fecha de cada mes entre septiembre y enero», que es la profundidad de bucket — lo que
 * hace ELEGIBLE el bucket mensual del motor (exige ≥3 fechas distintas del mes).
 *
 * 🚨 Por qué el filtro va AQUÍ y no en quien consume el plan. El orden de urgencia manda lo virgen
 * primero y, entre vírgenes, la ronda baja antes que la alta (ver `ventanasQuePedir`), así que las
 * rondas de profundidad son justo las últimas de la cola: filtrar DESPUÉS del tope deja pasar solo
 * las que el tope no se comió ya. Medido con el corpus real del 08/08/2026: de las 40 ventanas de
 * ronda 2-3 entre sep y ene, `?max=30` + filtro en cliente solo alcanzaba 18, y NINGUNA de ronda 3
 * — sin que nada lo dijera. Filtrando antes del tope se piden las 30 que de verdad se querían.
 */
export type FiltroVentanas = {
  /** solo estas rondas; vacío u omitido = todas. Reparto de rondas en `mercado-ventanas.ts`. */
  rondas?: number[]
  /** checkin >= desde (YYYY-MM-DD) */
  desde?: string
  /** checkin <= hasta (YYYY-MM-DD) */
  hasta?: string
  /**
   * Plazas de la pasada guardadas para los bloques de mayor factor sin medir (ver
   * `conReservaAltoValor`). Omitido = `RESERVA_ALTO_VALOR`; `0` = cola de urgencia pura.
   */
  reservaAltoValor?: number
}

export type PlanPedido = {
  /** las que hay que medir en esta pasada (ya ordenadas por urgencia y recortadas al tope) */
  ventanas: VentanaPedida[]
  /** cuántas casaban el filtro ANTES del tope */
  candidatas: number
  /**
   * cuántas dejó fuera el tope. Va en el contrato a propósito: un recorte mudo se lee como
   * «esto era todo lo que había», que es la misma mentira que un `?? []` sobre un dato sin mirar.
   */
  recortadas: number
}

/** Tope por defecto de ventanas por pasada, y techo duro (cada consulta cuesta contexto). */
export const MAX_VENTANAS_DEFECTO = 12
export const MAX_VENTANAS_TECHO = 30

export type ParametrosPlan = { max: number; filtro: FiltroVentanas }

/**
 * Lee los parámetros del plan (`max`, `rondas`, `desde`, `hasta`) de una query string.
 *
 * Vive AQUÍ y no en el route handler para poder testearlo: el handler necesita Prisma y el alias
 * `@/`, así que su lógica no se puede ejercitar con `node --test`. Lo que no se puede ejecutar en
 * un test es justo donde se esconden los fallos mudos — y este parseo ya tenía uno:
 *
 * 🚨 **`?max=abc` devolvía CERO ventanas en silencio** (09/08/2026). `Number('abc')` es `NaN`,
 * `Math.min(30, Math.max(1, NaN))` sigue siendo `NaN`, y `slice(0, NaN)` devuelve `[]` — así que
 * una pasada con el tope mal escrito no medía nada y lo reportaba como «no había ventanas», con
 * `recortadas: NaN` (que en JSON sale como `null`). Mismo fallo de clase que el filtro en cliente
 * que este módulo vino a arreglar, pero dentro del propio endpoint. Ahora un `max` no numérico se
 * RECHAZA; un `max` fuera de rango se acota y se dice.
 */
export function parsearParametrosPlan(
  qs: URLSearchParams,
): { ok: true; valor: ParametrosPlan; avisos: string[] } | { ok: false; error: string } {
  const avisos: string[] = []

  const maxRaw = qs.get('max')
  let max = MAX_VENTANAS_DEFECTO
  if (maxRaw !== null) {
    const n = Number(maxRaw)
    if (maxRaw.trim() === '' || !Number.isFinite(n) || !Number.isInteger(n)) {
      return { ok: false, error: `max inválido: "${maxRaw}". Formato: entero entre 1 y ${MAX_VENTANAS_TECHO}` }
    }
    max = Math.min(MAX_VENTANAS_TECHO, Math.max(1, n))
    // Acotar en silencio es mentir a medias: quien pidió 100 tiene que saber que le dieron 30.
    if (max !== n) avisos.push(`max=${n} acotado a ${max} (rango válido 1-${MAX_VENTANAS_TECHO})`)
  }

  const filtro: FiltroVentanas = {}

  const rondasRaw = qs.get('rondas')
  if (rondasRaw !== null) {
    const partes = rondasRaw.split(',').map(s => s.trim()).filter(Boolean)
    const rondas = partes.map(Number)
    if (!partes.length || rondas.some(n => !Number.isInteger(n) || n < 0)) {
      return {
        ok: false,
        error: `rondas inválidas: "${rondasRaw}". Formato: enteros ≥0 separados por coma (p. ej. 2,3)`,
      }
    }
    filtro.rondas = [...new Set(rondas)]
  }

  const ISO = /^\d{4}-\d{2}-\d{2}$/
  for (const clave of ['desde', 'hasta'] as const) {
    const v = qs.get(clave)
    if (v === null) continue
    if (!ISO.test(v)) return { ok: false, error: `${clave} inválida: "${v}". Formato: YYYY-MM-DD` }
    filtro[clave] = v
  }
  if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta) {
    return { ok: false, error: `rango vacío: desde (${filtro.desde}) es posterior a hasta (${filtro.hasta})` }
  }

  return { ok: true, valor: { max, filtro }, avisos }
}

/**
 * Fechas normales (NO de evento) que el motor exige de un mes para fiarse de su línea de temporada.
 * Es el mismo umbral que `MIN_FECHAS_MES` de `pricing/apply`; si allí cambia, cambia aquí.
 */
export const MIN_FECHAS_BUCKET = 3

/**
 * Meses del plan que NO llegan al mínimo de fechas NORMALES medidas — o sea, aquellos sobre los que
 * el motor no puede formarse una opinión propia y acaba anclando al percentil GLOBAL.
 *
 * 🚨 POR QUÉ EXISTE (26/08/2026, regla de Alberto «la subida tiene que confirmarla Booking»).
 * Su regla es: subir en cuanto se huela el evento («ya tendremos tiempo de bajarlo») y CONFIRMAR
 * después con el mercado, ajustando si la competencia no acompaña. La primera mitad ya funcionaba;
 * la segunda no podía llegar nunca a las fechas más caras del año, por un círculo cerrado:
 *   · los eventos gordos caen LEJOS (Feria, Semana Santa, Copa del Rey — todos 2027);
 *   · el plan SÍ mide esas noches de evento (ronda 1, y la reserva de alto valor);
 *   · pero el bucket mensual del motor EXCLUYE las fechas de evento a propósito, para que la Feria
 *     no arrastre la mediana de todo abril;
 *   · así que esos meses acumulaban mediciones que NO podían hacer elegible su bucket, y el salto
 *     de evento seguía multiplicando el ancla global — la que se mueve sola (ver el serrucho de
 *     `pricing-base-evento.ts`).
 * Medido ese día contra el corpus fiable: sep-2026→mar-2027 tenían 5-13 fechas normales (bucket
 * vivo) y abr/may/jun/jul-2027 tenían 2, 2, 1 y 1 (bucket muerto). Abril tenía 6 fechas medidas,
 * pero 4 eran de evento y no contaban.
 *
 * Un mes corto es, además, donde una sola medición rinde más: pasa de «no lo sé» a «lo sé».
 * Refrescar un mes que ya tiene diez fechas no cambia ninguna decisión.
 *
 * 🚨 `mesesEnPlan` NO es decorativo: un mes con CERO fechas normales medidas no aparece en la
 * cobertura, así que contar solo lo medido lo dejaría fuera de la lista — el mes MÁS a ciegas
 * sería justo el único que no se declara corto. Es la misma trampa que confundir «no lo he mirado»
 * con «no hay»: aquí el hueco no está en un `NULL`, está en la fila que no existe.
 */
export function mesesSinBucket(
  cobertura: CoberturaVentana[],
  fechasEvento: ReadonlySet<string>,
  mesesEnPlan: Iterable<string>,
  minFechas = MIN_FECHAS_BUCKET,
): Set<string> {
  const normalesPorMes = new Map<string, Set<string>>()
  for (const c of cobertura) {
    if (c.comps <= 0) continue
    if (fechasEvento.has(c.checkin)) continue // no suma al bucket: el motor la excluye
    const mes = c.checkin.slice(0, 7)
    if (!normalesPorMes.has(mes)) normalesPorMes.set(mes, new Set())
    normalesPorMes.get(mes)!.add(c.checkin)
  }
  const cortos = new Set<string>()
  for (const mes of mesesEnPlan) {
    if ((normalesPorMes.get(mes)?.size ?? 0) < minFechas) cortos.add(mes)
  }
  return cortos
}

/**
 * Lo que hace falta saber para marcar una ventana como «mes corto». Se pasa entero o no se pasa:
 * sin las fechas de evento, marcar el mes sería mentir a medias — medir una noche de Feria NO
 * acerca a abril a tener bucket, por muy corto que esté abril.
 */
export type ContextoBucket = {
  /** meses `YYYY-MM` sin bucket elegible. Ver `mesesSinBucket`. */
  mesesCortos: ReadonlySet<string>
  /** fechas `YYYY-MM-DD` de evento: el bucket mensual del motor las excluye. */
  fechasEvento: ReadonlySet<string>
}

const DIA_MS = 86_400_000

function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round(
    (new Date(hastaIso + 'T00:00:00Z').getTime() - new Date(desdeIso + 'T00:00:00Z').getTime()) / DIA_MS,
  )
}

function clave(checkin: string, aforo: number): string {
  return `${checkin}#${aforo}`
}

/**
 * Cruza el plan de ventanas (fechas) con los aforos de los pisos y la cobertura fiable ya medida,
 * y devuelve las `max` que más falta hacen.
 *
 * Orden de urgencia, y el porqué de cada nivel:
 *   1. **Nunca medida** antes que vieja. Una fecha sin ningún comp fiable es un hueco que el motor
 *      rellena con el ancla global (dominada por las fechas cercanas, más baratas); una fecha
 *      medida hace tres días sigue siendo razonablemente cierta.
 *   2. Entre vírgenes, **el evento CONFIRMADO sin medir pasa por DELANTE de todo** (13/08/2026,
 *      caso Bienal): el motor CONGELA esas noches a un precio posiblemente falso hasta que se
 *      midan — cada día sin medir es un día congelado. Solo confirmados: un previsto es una
 *      apuesta y no gasta ventana prioritaria.
 *   3. Después, **el MES CORTO** (`bucket`, 26/08/2026): una fecha normal de un mes al que le faltan
 *      una o dos para tener bucket elegible pasa por delante de la 1ª fecha de un mes que ya tiene
 *      diez. Sin bucket propio, el salto de evento de ese mes multiplica el ancla GLOBAL, y la
 *      confirmación por mercado que pide Alberto no llega nunca. Ver `mesesSinBucket`.
 *   4. Luego, **ronda base antes que evento previsto**: la línea de temporada es lo que hace
 *      elegible el bucket mensual del motor (exige ≥3 fechas distintas del mes), y sin bucket no
 *      hay temporada que aplicar a los otros 28 días del mes.
 *   5. A igualdad, **la fecha más cercana primero**: es la que ya se está vendiendo.
 *
 * `hoyIso` entra como parámetro (no `new Date()`) para que la función sea pura y testeable.
 *
 * `filtro` recorta el plan ANTES de aplicar el tope (ver `FiltroVentanas`); sin él se comporta
 * exactamente como antes. `bucket` es OPCIONAL: sin él ninguna ventana se marca `mesCorto` y el
 * orden es el de siempre — un consumidor que no sepa qué meses están cortos no debe adivinarlo.
 */
export function planDeVentanas(
  plan: Ventana[],
  aforos: Map<number, string[]>,
  cobertura: CoberturaVentana[],
  hoyIso: string,
  max = 12,
  filtro: FiltroVentanas = {},
  bucket?: ContextoBucket,
): PlanPedido {
  const porClave = new Map<string, CoberturaVentana>()
  for (const c of cobertura) porClave.set(clave(c.checkin, c.aforo), c)

  const rondas = filtro.rondas?.length ? new Set(filtro.rondas) : null

  const pedidas: VentanaPedida[] = []
  for (const v of plan) {
    if (rondas && !rondas.has(v.ronda)) continue
    if (filtro.desde && v.checkin < filtro.desde) continue
    if (filtro.hasta && v.checkin > filtro.hasta) continue
    for (const [aforo, pisos] of aforos) {
      if (!pisos.length) continue
      const c = porClave.get(clave(v.checkin, aforo))
      const diasSinMedir = c?.ultimaMedicion ? diasEntre(c.ultimaMedicion, hoyIso) : null
      // Solo cuenta como «mes corto» si medir ESTA ventana acerca al mes a tener bucket: una
      // noche de evento no suma nunca, esté el mes como esté.
      const mesCorto = bucket != null
        && bucket.mesesCortos.has(v.checkin.slice(0, 7))
        && !bucket.fechasEvento.has(v.checkin)
      pedidas.push({
        checkin: v.checkin,
        checkout: v.checkout,
        aforo,
        pisos,
        motivo: v.motivo,
        etiqueta: v.etiqueta,
        ronda: v.ronda,
        eventoConfirmado: v.eventoConfirmado === true,
        factor: Number(v.factor) > 0 ? Number(v.factor) : 1,
        diasSinMedir,
        comps: c?.comps ?? 0,
        mesCorto,
      })
    }
  }

  pedidas.sort((a, b) => {
    const aNunca = a.diasSinMedir === null
    const bNunca = b.diasSinMedir === null
    if (aNunca !== bNunca) return aNunca ? -1 : 1
    if (aNunca && bNunca) {
      // Ambas vírgenes: el evento CONFIRMADO primero (su precio está congelado hasta medirse),
      // luego la ronda (base → evento previsto → profundidad) y luego la cercanía.
      const aCong = a.eventoConfirmado === true
      const bCong = b.eventoConfirmado === true
      if (aCong !== bCong) return aCong ? -1 : 1
      // Después de lo congelado, el MES CORTO — y por delante de la ronda a propósito: la 2ª y 3ª
      // fecha de un mes sin bucket valen más que la 1ª de un mes que ya tiene diez. Es reordenar,
      // no medir más: el tope de la pasada no se toca.
      const aCorto = a.mesCorto === true
      const bCorto = b.mesCorto === true
      if (aCorto !== bCorto) return aCorto ? -1 : 1
      if (a.ronda !== b.ronda) return a.ronda - b.ronda
      return a.checkin.localeCompare(b.checkin)
    }
    // Ambas medidas: la más vieja primero; empate → la fecha más cercana.
    if (a.diasSinMedir !== b.diasSinMedir) return (b.diasSinMedir ?? 0) - (a.diasSinMedir ?? 0)
    return a.checkin.localeCompare(b.checkin)
  })

  const tope = Math.max(1, max)
  const ventanas = conReservas(pedidas, tope, { altoValor: filtro.reservaAltoValor })
  return {
    ventanas,
    candidatas: pedidas.length,
    recortadas: Math.max(0, pedidas.length - ventanas.length),
  }
}

/** Cuántas plazas de cada pasada se guardan para los bloques CAROS sin medir. */
export const RESERVA_ALTO_VALOR = 3

/**
 * Cuántas plazas de cada pasada se guardan para los MESES SIN BUCKET elegible.
 *
 * 🚨 POR QUÉ (28/08/2026, julio y agosto de 2027). Hermano exacto del de arriba, y el mismo fallo por
 * otra puerta: la cola antepone el evento CONFIRMADO sin medir —correctamente, su precio está
 * congelado hasta que Booking lo mida— y ese día había suficientes para comerse las 24 ventanas
 * enteras. Resultado medido: julio-2027 (20 comps en 2 fechas, le falta UNA) y agosto-2027 (cero)
 * llevaban días en la cola sin que les llegara el turno, y el motor tarificaba sus **62 noches — el
 * 17% del calendario, iguales en los 4 pisos** — con la mediana ANUAL en vez de con su temporada.
 * En Sevilla eso no es un detalle: el ADR de agosto es 102€ contra 142€ de media, así que la mediana
 * anual pide de más justo en el mes más flojo.
 *
 * El orden NO se toca: reordenar dejaría precios de evento congelados sin verificar, que es lo que
 * esa prioridad existe para evitar. Lo que se hace es garantizar SUELO de cuota, igual que con los
 * bloques caros. Cuatro plazas cubren un mes entero (3 fechas × 4 aforos = 12 ventanas) en tres
 * pasadas, y si no hay meses cortos que rescatar la reserva no se desperdicia: vuelve a la cola.
 */
export const RESERVA_MES_CORTO = 4

/**
 * Reparte el tope de la pasada entre la cola de urgencia y una RESERVA para lo caro sin medir.
 *
 * 🚨 POR QUÉ (18/08/2026, Navidad de House). La cola ordena por urgencia y, dentro de las vírgenes,
 * por CERCANÍA — y eso, con el plan expandido por fecha de los eventos confirmados, es una cola FIFO
 * por calendario: entre hoy y Navidad había ~44 noches de evento (Bienal 25, Pilar 4, Todos los
 * Santos 3, el bloque de noviembre 7, el puente de diciembre 5) × 4 aforos = ~176 ventanas por
 * delante. A 12 por pasada, la Navidad no se medía hasta diciembre. Medido ese día en `market_rates`:
 * del 19/12 al 07/01 NO había un solo comparable fiable, y el motor tarificaba Nochebuena con la
 * mediana de las noches normales de diciembre. El bloque más caro del invierno era el único a ciegas.
 *
 * La reserva coge, de lo que el tope dejaría fuera, las ventanas de mayor FACTOR nunca medidas: así
 * los bloques gordos (Feria 3,2 · Semana Santa 3,2 · puente de diciembre 1,9 · Navidad 1,85) entran
 * en las primeras pasadas aunque estén a ocho meses, y van rotando solos según se van midiendo.
 * Nunca crece por encima del tope: la pasada sigue costando lo mismo.
 */
/**
 * Reparte el tope de la pasada entre la cola de urgencia y DOS reservas de suelo.
 *
 * Las dos existen por el mismo motivo —la cola de urgencia, siendo correcta, deja fuera para siempre
 * a un grupo que importa— y cada una lo aprendio con un caso real:
 *   - `altoValor` -> Navidad de House (18/08/2026): el plan expandido por fecha de los eventos
 *     confirmados es una cola FIFO por calendario y el bloque mas caro del invierno no se media.
 *   - `mesCorto`  -> julio y agosto de 2027 (28/08/2026): los eventos confirmados sin medir se comen
 *     el cupo entero y los meses sin bucket nunca llegan, asi que sus noches se tarifican con la
 *     mediana ANUAL. Ver `RESERVA_MES_CORTO`.
 *
 * Ninguna reordena la cola: las dos RESERVAN plazas del mismo tope, asi que la pasada sigue costando
 * exactamente lo mismo. Lo que una reserva no llegue a usar vuelve a la cola de urgencia - nunca se
 * desperdicia una consulta.
 */
export function conReservas(
  pedidas: VentanaPedida[],
  tope: number,
  reservas: { altoValor?: number; mesCorto?: number } = {},
): VentanaPedida[] {
  const rAlto = Math.max(0, reservas.altoValor ?? RESERVA_ALTO_VALOR)
  const rMes = Math.max(0, reservas.mesCorto ?? RESERVA_MES_CORTO)
  // Las reservas nunca dejan la cabeza vacia: si el tope es pequeno, se recortan a la vez.
  const total = Math.min(rAlto + rMes, Math.max(0, tope - 1))
  if (total === 0 || pedidas.length <= tope) return pedidas.slice(0, tope)
  const alto = Math.min(rAlto, total)
  const mes = Math.min(rMes, total - alto)

  const cabeza = pedidas.slice(0, tope - total)
  const dentro = new Set(cabeza.map(v => clave(v.checkin, v.aforo)))
  const fuera = (v: VentanaPedida) => !dentro.has(clave(v.checkin, v.aforo))

  // Solo CONFIRMADOS: un previsto es una apuesta (su premio ya va ponderado y no congela ningun
  // precio), asi que no puede colarse por delante de una noche que el motor tiene congelada.
  const caras = pedidas
    .filter(v => fuera(v) && v.diasSinMedir === null && v.factor > 1 && v.eventoConfirmado === true)
    .sort((a, b) => (b.factor - a.factor) || a.checkin.localeCompare(b.checkin))
    .slice(0, alto)
  const yaCara = new Set(caras.map(v => clave(v.checkin, v.aforo)))

  // Mes corto: la fecha mas CERCANA primero. `mesCorto` ya excluye las noches de evento (medirlas no
  // acerca al mes a tener bucket), asi que aqui no hay que volver a filtrarlas.
  const cortos = pedidas
    .filter(v => fuera(v) && !yaCara.has(clave(v.checkin, v.aforo)) && v.mesCorto === true)
    .sort((a, b) => a.checkin.localeCompare(b.checkin))
    .slice(0, mes)
  const yaCorto = new Set(cortos.map(v => clave(v.checkin, v.aforo)))

  const resto = pedidas.filter(v => {
    const k = clave(v.checkin, v.aforo)
    return fuera(v) && !yaCara.has(k) && !yaCorto.has(k)
  })
  return [...cabeza, ...caras, ...cortos, ...resto].slice(0, tope)
}

export function conReservaAltoValor(
  pedidas: VentanaPedida[],
  tope: number,
  reserva = RESERVA_ALTO_VALOR,
): VentanaPedida[] {
  const r = Math.max(0, Math.min(reserva, Math.max(0, tope - 1)))
  if (r === 0 || pedidas.length <= tope) return pedidas.slice(0, tope)

  const cabeza = pedidas.slice(0, tope - r)
  const dentro = new Set(cabeza.map(v => clave(v.checkin, v.aforo)))
  // Solo CONFIRMADOS: un previsto es una apuesta (su premio ya va ponderado y no congela ningún
  // precio), así que no puede colarse por delante de una noche que el motor tiene congelada.
  const caras = pedidas
    .filter(v => !dentro.has(clave(v.checkin, v.aforo)) &&
      v.diasSinMedir === null && v.factor > 1 && v.eventoConfirmado === true)
    .sort((a, b) => (b.factor - a.factor) || a.checkin.localeCompare(b.checkin))
    .slice(0, r)

  // Si no hay bloques caros vírgenes que rescatar, la reserva NO se desperdicia: la pasada vuelve a
  // llenarse con la cola de urgencia (que es lo que había antes de este reparto).
  const resto = pedidas.filter(v => {
    const k = clave(v.checkin, v.aforo)
    return !dentro.has(k) && !caras.some(c => clave(c.checkin, c.aforo) === k)
  })
  return [...cabeza, ...caras, ...resto].slice(0, tope)
}

/** Envoltura histórica: solo la lista. Nuevos usos, mejor `planDeVentanas` (declara el recorte). */
export function ventanasQuePedir(
  plan: Ventana[],
  aforos: Map<number, string[]>,
  cobertura: CoberturaVentana[],
  hoyIso: string,
  max = 12,
  filtro: FiltroVentanas = {},
  bucket?: ContextoBucket,
): VentanaPedida[] {
  return planDeVentanas(plan, aforos, cobertura, hoyIso, max, filtro, bucket).ventanas
}

/**
 * Parte de la pasada para el latido. Igual que en el barrido por búsqueda, **lo que NO se pudo
 * medir va primero**: una ventana que el conector no contestó es «no lo sé», no «no hay mercado»,
 * y confundirlas es exactamente lo que dejó al motor tarificando a ciegas en julio.
 */
export function detalleIngesta(r: {
  ventanas: number
  comps: number
  sinRespuesta: number
  sinPrecio: number
  errores: string[]
  /**
   * Anuncios NUESTROS que el portal devolvió y se descartaron (ver `mercado-propios.ts`). Se
   * declara aunque sea un descarte correcto: un comparable que desaparece sin decirlo es
   * indistinguible de uno que el conector nunca trajo. Opcional por compatibilidad — una pasada
   * que no lo mide no debe inventar un 0.
   */
  propios?: number
}): string {
  const partes = [`${r.comps} comps reales en ${r.ventanas} ventanas`]
  if (r.sinRespuesta) {
    partes.push(
      `⚠️ ${r.sinRespuesta} ventanas sin respuesta del conector (NO es «no hay mercado»: no se ha podido mirar)`,
    )
  }
  if (r.sinPrecio) partes.push(`${r.sinPrecio} sin precio utilizable (respondió, no traía cifra)`)
  if (r.propios) {
    partes.push(`🪞 ${r.propios} anuncio(s) propio(s) descartado(s) (no son mercado)`)
  }
  if (r.errores.length) partes.push(`${r.errores.length} fallos: ${r.errores[0]}`)
  return partes.join(' · ')
}

/**
 * ¿Vale la pasada? Conservador igual que `barridoFiable`: hace falta haber MEDIDO algo y que la
 * mayoría de lo intentado haya respondido. Una pasada que pide 12 ventanas y solo contesta 1 no
 * es «poco mercado», es un conector medio caído — y eso tiene que verse en rojo.
 */
export function ingestaFiable(r: {
  ventanas: number
  comps: number
  sinRespuesta: number
  errores: string[]
}): boolean {
  if (r.errores.length) return false
  if (r.ventanas === 0) return false
  if (r.comps === 0) return false
  // Estrictamente MENOS de la mitad: con la mitad justa sin contestar ya no se puede afirmar que
  // se ha mirado el mercado, y ante la duda el latido va en rojo.
  return r.sinRespuesta * 2 < r.ventanas
}
