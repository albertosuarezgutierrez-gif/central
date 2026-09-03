/**
 * Estimación de la fecha de matriculación a partir de la matrícula española.
 *
 * 🚨 LO PRIMERO, PORQUE ES LO QUE MÁS DUELE SI SE OLVIDA: esto es una
 * ESTIMACIÓN, nunca un dato oficial. Lo único que sabe este módulo es en qué
 * POSICIÓN de la serie nacional cae una matrícula; la fecha sale de interpolar
 * esa posición contra una tabla de hitos publicada, no de consultar a la DGT.
 * Por eso el tipo de salida NO es un `Date` ni un string suelto (que aguas
 * abajo se pintaría igual que un dato confirmado) sino un rango
 * `{ desde, hasta, estimada }`: quien lo pinte TIENE que poder decir «sobre
 * junio de 2015», no «matriculado el 12/06/2015». Regla global del monorepo:
 * un dato calculado jamás se sirve como si fuera confirmado.
 *
 * Y dos límites que hay que trasladar al usuario final:
 *  - Estima la fecha de la MATRICULACIÓN ESPAÑOLA, que no siempre es la
 *    primera matriculación del vehículo: un coche importado se matricula aquí
 *    años después de fabricarse y de rodar fuera. Para el precio del seguro
 *    manda la primera matriculación, así que el dato bueno lo tiene la ficha
 *    técnica, no la matrícula.
 *  - Una matrícula puede reasignarse (vehículo histórico, rematriculación),
 *    y ahí la serie miente sin que se note.
 *
 * ── CÓMO FUNCIONA ────────────────────────────────────────────────────────────
 * Desde el 18/09/2000 (Orden del Ministerio del Interior de 27/09/1999) la
 * matrícula española es `0000 XXX`: cuatro dígitos y tres letras, ÚNICA para
 * todo el país y emitida en orden ESTRICTAMENTE SECUENCIAL, sin provincia. Las
 * letras excluyen las vocales y la Ñ, la Q, la CH y la LL, así que el alfabeto
 * real son 20 consonantes (`BCDFGHJKLMNPRSTVWXYZ`) y el orden es
 * `0000BBB → 9999BBB → 0000BCB → … → 9999ZZZ`.
 *
 * Como es secuencial, la matrícula se convierte a un ORDINAL entero (cuántas
 * matrículas se emitieron antes que ella) y la fecha sale de interpolar ese
 * ordinal entre dos hitos conocidos. Hacerlo comparando TEXTO es garantía de
 * fallo: '9999BBB' < '0000BCB' en la serie, pero al revés en orden alfabético.
 *
 * ── DE DÓNDE SALEN LOS HITOS ─────────────────────────────────────────────────
 * `SERIES_FIN_DE_MES` es la tabla «matrículas por año y mes» que publican (con
 * los mismos valores) las calculadoras del sector a partir del dato que la DGT
 * difunde a diario: la última matrícula asignada. Se cotejó en septiembre de
 * 2026 contra fechamatriculacion.es/tabla-matriculas, seisenlinea.com/edad-
 * matriculas, urbantecno.com/motor/tabla-de-matriculas-por-ano-y-mes-desde-el-
 * 2000-a-hoy y matriculas.com.es, más la fecha de arranque de la serie
 * (18/09/2000, 0000 BBB) que documenta Wikipedia («Vehicle registration plates
 * of Spain»). Cada casilla es la serie ALCANZADA AL CERRAR ese mes, así que el
 * hito que genera es «el 1 del mes siguiente el contador iba por 0000<serie>».
 *
 * 313 hitos: uno por mes desde septiembre de 2000 hasta agosto de 2026, más el
 * arranque. Se comprobó que la tabla es estrictamente creciente y que su ritmo
 * mensual reproduce el ciclo económico real —pico de 200-250 mil/mes en
 * 2005-2007, suelo de 60-100 mil en la crisis de 2009-2013 y **10.000 en abril
 * de 2020**, el mes del confinamiento—, que es la huella que separa una tabla
 * real de una inventada.
 *
 * ── PRECISIÓN MEDIDA (03/09/2026) ────────────────────────────────────────────
 * Contra 1.430 matrículas modernas reales de la cartera de Grupo Asegura que
 * llevan además el año del vehículo declarado en la póliza:
 *   · 1.352 (94,5 %) → el año estimado coincide EXACTAMENTE con el declarado.
 *   ·  1.381 (96,6 %) → dentro de ±1 año (el desfase de un año es lo normal en
 *     un coche matriculado en diciembre, o de modelo del año anterior).
 * El acierto es del 88-100 % en TODOS y CADA UNO de los años 2000-2022, o sea
 * que la tabla no se desvía en ningún tramo. En la práctica: el mes acierta
 * dentro de la ventana `desde`-`hasta`, y el año casi siempre.
 *
 * ── SIN DEPENDENCIAS Y SIN `Date` ────────────────────────────────────────────
 * Esto lo puede importar un componente de navegador: nada de `node:*`, nada de
 * npm y ni siquiera `Date` — las fechas se manejan como día juliano entero
 * (algoritmo de Howard Hinnant), que además evita que la zona horaria del
 * cliente corra un día la estimación.
 */

/** Las 20 consonantes de la serie moderna, EN ORDEN. Sin vocales, Ñ, Q, CH ni LL. */
export const ALFABETO_SERIE = 'BCDFGHJKLMNPRSTVWXYZ'

/** Primera matrícula de la serie moderna: `0000 BBB`, ordinal 0. */
export const PRIMERA_MATRICULA_MODERNA = '2000-09-18'

/**
 * Serie alcanzada al CERRAR cada mes. `null` = meses anteriores al arranque.
 * Si alguien actualiza esta tabla, que añada meses al final y NO reescriba los
 * viejos: son historia, no una previsión.
 */
const SERIES_FIN_DE_MES: Readonly<Record<number, readonly (string | null)[]>> = {
  2000: [null, null, null, null, null, null, null, null, 'BBJ', 'BCD', 'BCY', 'BDR'],
  2001: ['BFJ', 'BGF', 'BHG', 'BJC', 'BKB', 'BLC', 'BMF', 'BMW', 'BNL', 'BPG', 'BRB', 'BRT'],
  2002: ['BSL', 'BTF', 'BTZ', 'BVW', 'BWT', 'BXP', 'BYP', 'BZF', 'BZV', 'CBP', 'CCH', 'CDC'],
  2003: ['CDV', 'CFM', 'CGJ', 'CHF', 'CJC', 'CKB', 'CLD', 'CLV', 'CMM', 'CNK', 'CPF', 'CRC'],
  2004: ['CRV', 'CSS', 'CTT', 'CVR', 'CWR', 'CXT', 'CYY', 'CZP', 'DBJ', 'DCH', 'DDG', 'DFF'],
  2005: ['DFZ', 'DGX', 'DHZ', 'DKB', 'DLD', 'DMJ', 'DNP', 'DPK', 'DRG', 'DSC', 'DTB', 'DVB'],
  2006: ['DVW', 'DWT', 'DXZ', 'DYY', 'FBC', 'FCJ', 'FDP', 'FFK', 'FGF', 'FHD', 'FJD', 'FKC'],
  2007: ['FKY', 'FLV', 'FNB', 'FNZ', 'FRC', 'FSJ', 'FTP', 'FVJ', 'FWC', 'FXB', 'FXY', 'FYY'],
  2008: ['FZR', 'GBN', 'GCK', 'GDH', 'GFC', 'GFY', 'GGV', 'GHG', 'GHT', 'GJJ', 'GJV', 'GKH'],
  2009: ['GKS', 'GLC', 'GLP', 'GMC', 'GMN', 'GNF', 'GNY', 'GPJ', 'GPW', 'GRM', 'GSC', 'GSR'],
  2010: ['GTC', 'GTS', 'GVM', 'GWC', 'GWV', 'GXP', 'GYD', 'GYM', 'GYX', 'GZJ', 'GZT', 'HBG'],
  2011: ['HBP', 'HCB', 'HCR', 'HDC', 'HDR', 'HFF', 'HFT', 'HGC', 'HGM', 'HGX', 'HHH', 'HHT'],
  2012: ['HJC', 'HJM', 'HKB', 'HKL', 'HKX', 'HLK', 'HLW', 'HMD', 'HML', 'HMT', 'HNC', 'HNK'],
  2013: ['HNT', 'HPC', 'HPN', 'HPY', 'HRK', 'HRX', 'HSK', 'HSS', 'HSZ', 'HTK', 'HTV', 'HVF'],
  2014: ['HVN', 'HVZ', 'HWM', 'HXB', 'HXN', 'HYD', 'HYT', 'HZB', 'HZL', 'HZZ', 'JBL', 'JBY'],
  2015: ['JCK', 'JCY', 'JDR', 'JFG', 'JFX', 'JGR', 'JHJ', 'JHT', 'JJH', 'JJW', 'JKK', 'JKZ'],
  2016: ['JLN', 'JMF', 'JMY', 'JNR', 'JPK', 'JRG', 'JRZ', 'JSL', 'JTB', 'JTR', 'JVH', 'JVZ'],
  2017: ['JWN', 'JXF', 'JYB', 'JYT', 'JZP', 'KBM', 'KCH', 'KCV', 'KDK', 'KFC', 'KFW', 'KGN'],
  2018: ['KHG', 'KHY', 'KJV', 'KKR', 'KLN', 'KMM', 'KNK', 'KPD', 'KPS', 'KRJ', 'KRZ', 'KSS'],
  2019: ['KTJ', 'KVB', 'KVX', 'KWT', 'KXR', 'KYN', 'KZK', 'KZY', 'LBN', 'LCG', 'LCY', 'LDR'],
  // Abril de 2020 avanza UNA sola serie (10.000 matrículas): el confinamiento.
  2020: ['LFH', 'LFY', 'LGG', 'LGH', 'LGP', 'LHG', 'LJD', 'LJR', 'LKF', 'LKV', 'LLJ', 'LMC'],
  2021: ['LMK', 'LMX', 'LNM', 'LPD', 'LPW', 'LRN', 'LSF', 'LSP', 'LTD', 'LTR', 'LVF', 'LVV'],
  2022: ['LWD', 'LWP', 'LXC', 'LXR', 'LYH', 'LYZ', 'LZN', 'LZY', 'MBN', 'MCB', 'MCP', 'MDF'],
  2023: ['MDR', 'MFF', 'MFY', 'MGM', 'MHG', 'MHZ', 'MJR', 'MKC', 'MKR', 'MLH', 'MLX', 'MMN'],
  2024: ['MNC', 'MNS', 'MPL', 'MRD', 'MRY', 'MSS', 'MTK', 'MTW', 'MVL', 'MWC', 'MWV', 'MXP'],
  2025: ['MYC', 'MYW', 'MZS', 'NBK', 'NCJ', 'NDD', 'NFC', 'NFR', 'NGJ', 'NHD', 'NHX', 'NJS'],
  2026: ['NKH', 'NLB', 'NLZ', 'NMW', 'NNT', 'NPT', 'NRR', 'NRY'],
}

/**
 * Margen que se abre a cada lado del intervalo entre hitos.
 *
 * La tabla publicada da las LETRAS de la última matrícula del mes pero no sus
 * cuatro dígitos, así que cada hito tiene una incertidumbre de hasta una serie
 * entera (10.000 matrículas ≈ 2-3 días al ritmo actual). Cinco días cubren eso
 * sin inflar el rango hasta volverlo inútil.
 */
const MARGEN_DIAS = 5

// ── Fechas como día entero (Howard Hinnant). Sin `Date`, sin zona horaria. ────

function diasDesdeCivil(anio: number, mes: number, dia: number): number {
  const y = anio - (mes <= 2 ? 1 : 0)
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (mes + (mes > 2 ? -3 : 9)) + 2) / 5) + dia - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function civilDesdeDias(dias: number): string {
  const z = dias + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const dia = doy - Math.floor((153 * mp + 2) / 5) + 1
  const mes = mp + (mp < 10 ? 3 : -9)
  const anio = y + (mes <= 2 ? 1 : 0)
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// ── Hitos: [día, ordinal], estrictamente creciente en las dos columnas. ───────

type Hito = readonly [dia: number, ordinal: number]

function ordinalDeSerie(serie: string): number {
  const a = ALFABETO_SERIE.indexOf(serie[0]!)
  const b = ALFABETO_SERIE.indexOf(serie[1]!)
  const c = ALFABETO_SERIE.indexOf(serie[2]!)
  if (a < 0 || b < 0 || c < 0) throw new Error(`serie fuera del alfabeto: ${serie}`)
  return ((a * 20 + b) * 20 + c) * 10000
}

const HITOS: readonly Hito[] = (() => {
  const salida: Hito[] = [[diasDesdeCivil(2000, 9, 18), 0]]
  for (const anio of Object.keys(SERIES_FIN_DE_MES).map(Number).sort((x, y) => x - y)) {
    SERIES_FIN_DE_MES[anio]!.forEach((serie, i) => {
      if (!serie) return
      // La casilla es el cierre del mes i+1 → el hito cae el 1 del mes siguiente.
      const anioHito = i === 11 ? anio + 1 : anio
      const mesHito = i === 11 ? 1 : i + 2
      salida.push([diasDesdeCivil(anioHito, mesHito, 1), ordinalDeSerie(serie)])
    })
  }
  return salida
})()

/** Último hito con dato real. Por encima de su ordinal NO se estima: se dice que no se sabe. */
export const ULTIMO_HITO_CONOCIDO = civilDesdeDias(HITOS[HITOS.length - 1]![0])

// ── API ──────────────────────────────────────────────────────────────────────

export type FormatoMatricula = 'moderna' | 'provincial' | 'ciclomotor' | 'desconocido'

/** Quita todo lo que no sea letra o dígito (espacios, guiones, puntos) y pasa a mayúsculas. */
export function normalizarMatricula(valor: string): string {
  if (typeof valor !== 'string') return ''
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const RE_MODERNA = new RegExp(`^[0-9]{4}[${ALFABETO_SERIE}]{3}$`)
// Ciclomotores desde 1999: `C` + 4 dígitos + 3 letras. Serie PROPIA, no la nacional.
const RE_CICLOMOTOR = new RegExp(`^C[0-9]{4}[${ALFABETO_SERIE}]{3}$`)
// Provincial (hasta el 18/09/2000): 1-2 letras de provincia + 4-6 dígitos + 0-2 letras.
const RE_PROVINCIAL = /^[A-Z]{1,2}[0-9]{4,6}[A-Z]{0,2}$/

/**
 * Qué clase de matrícula es. El orden importa: `C1234BCD` es un ciclomotor
 * (3 letras finales), mientras que `C1234BC` es una provincial de A Coruña.
 */
export function formatoMatricula(valor: string): FormatoMatricula {
  const m = normalizarMatricula(valor)
  if (RE_MODERNA.test(m)) return 'moderna'
  if (RE_CICLOMOTOR.test(m)) return 'ciclomotor'
  if (RE_PROVINCIAL.test(m)) return 'provincial'
  return 'desconocido'
}

/**
 * Posición de la matrícula en la serie nacional: cuántas se emitieron antes.
 * `0000BBB` → 0, `0001BBB` → 1, `0000BCB` → 10.000. `null` si no es moderna.
 */
export function ordinalMatricula(valor: string): number | null {
  const m = normalizarMatricula(valor)
  if (!RE_MODERNA.test(m)) return null
  return ordinalDeSerie(m.slice(4)) + Number(m.slice(0, 4))
}

/**
 * Resultado de la estimación. Los tres campos son `YYYY-MM-DD`.
 *
 * `estimada` es el punto medio de la interpolación y NO es una fecha oficial:
 * lo honesto es enseñar el rango `desde`-`hasta` (o al menos el mes) y decir
 * que está calculado. El campo `metodo` está para que aguas abajo nadie pueda
 * confundir esto con un dato traído de la DGT o de la ficha técnica.
 */
export type MatriculacionEstimada = {
  /** Punto medio de la interpolación. ES UNA ESTIMACIÓN. */
  readonly estimada: string
  /** Extremo inferior del rango: no puede ser anterior a esto. */
  readonly desde: string
  /** Extremo superior del rango: no puede ser posterior a esto. */
  readonly hasta: string
  /** Posición en la serie nacional de la que sale todo. */
  readonly ordinal: number
  /** Marca explícita de que el dato está CALCULADO, no consultado. */
  readonly metodo: 'interpolacion_serie_nacional'
}

/**
 * Estima cuándo se matriculó en España el vehículo de esta matrícula.
 *
 * Devuelve `null` —«no lo sé»— y NUNCA una fecha de relleno cuando:
 *  · la matrícula no es de la serie moderna (provincial `M-1234-AB`, remolque,
 *    histórica, diplomática, basura, cadena vacía…): esas no van por la serie
 *    nacional y su fecha no se puede interpolar;
 *  · es de ciclomotor (`C0000XXX`): serie distinta, tabla distinta, y esta
 *    tabla no la cubre;
 *  · su ordinal es POSTERIOR al último hito conocido (`ULTIMO_HITO_CONOCIDO`):
 *    extrapolar más allá de la tabla es inventarse el futuro. Si la matrícula
 *    es de verdad reciente, la respuesta correcta es actualizar la tabla.
 */
export function fechaMatriculacionEstimada(valor: string): MatriculacionEstimada | null {
  const ordinal = ordinalMatricula(valor)
  if (ordinal === null) return null

  // Búsqueda binaria del tramo [h0, h1) que contiene el ordinal.
  let lo = 0
  let hi = HITOS.length - 1
  if (ordinal < HITOS[0]![1] || ordinal >= HITOS[hi]![1]) return null
  while (hi - lo > 1) {
    const medio = (lo + hi) >> 1
    if (HITOS[medio]![1] <= ordinal) lo = medio
    else hi = medio
  }
  const [dia0, ord0] = HITOS[lo]!
  const [dia1, ord1] = HITOS[hi]!

  // Interpolación lineal dentro del tramo (≈ un mes): se asume ritmo constante
  // dentro del mes, que no es exacto (fines de semana, cierre de mes) y por eso
  // el resultado se acompaña SIEMPRE del rango.
  const estimada = dia0 + Math.round(((dia1 - dia0) * (ordinal - ord0)) / (ord1 - ord0))

  // El rango es el tramo entero más el margen por la incertidumbre del hito,
  // recortado para que nunca prometa nada anterior a la primera matrícula de la
  // serie ni posterior al último hito con dato real.
  const minimo = HITOS[0]![0]
  const maximo = HITOS[HITOS.length - 1]![0]
  const desde = Math.max(minimo, dia0 - MARGEN_DIAS)
  const hasta = Math.min(maximo, dia1 + MARGEN_DIAS)

  return {
    estimada: civilDesdeDias(estimada),
    desde: civilDesdeDias(desde),
    hasta: civilDesdeDias(hasta),
    ordinal,
    metodo: 'interpolacion_serie_nacional',
  }
}
