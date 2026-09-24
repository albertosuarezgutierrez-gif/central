// Estimación propia de prima, a partir de casos que ya conocemos. PURO.
//
// Para qué sirve DE VERDAD: no tanto para enseñarle un precio al cliente como
// para decidir si merece la pena PEDIRLO. Cada cotización cuesta 0,50€ y no es
// idempotente. Si el cliente paga 250€ y lo que hemos visto en casas parecidas
// va de 240€ a 320€, no hay negocio y no se gasta; si va de 150€ a 200€, sí.
// Aplicado a una tanda de la cartera, eso convierte un gasto a ciegas en uno
// dirigido.
//
// 🚨 Esto NO es un precio y el tipo está hecho para que no pueda confundirse:
// `Estimacion` no tiene ningún campo llamado `precio`, lleva `orientativa: true`
// como tipo literal (no se puede construir en `false`) y su `etiqueta` nunca
// viene vacía. Enseñar una estimación nuestra como si fuera la oferta de una
// compañía es la forma más cara de perder un cliente: ve 180€, le dicen 260€, y
// no vuelve.
//
// Puro a propósito: la decisión de gastar dinero tiene que poder probarse sin
// BD. Quien reúne los casos (cartera + cotizaciones guardadas) vive aparte.

import { eur } from '../dinero.ts'

/** De dónde salió el caso. Los simulados NO entran aquí: los excluye la consulta. */
export type OrigenCaso = 'cartera' | 'cotizacion'

/** Un precio real observado en una casa concreta, con su fecha. */
export type Caso = {
  primaEur: number
  /** `YYYY-MM-DD`. Un precio sin fecha no se puede pesar: las tarifas cambian. */
  fecha: string
  origen: OrigenCaso
  /** La compañía que lo dio. `null` en cartera cuando no consta. */
  compania: string | null
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
}

export type RiesgoAEstimar = {
  metrosCuadrados: number | null
  anioConstruccion: number | null
  capitalContinente: number | null
}

export type Horquilla = { minEur: number; medianaEur: number; maxEur: number }

/** Sobre qué casos se ha construido. `null` cuando no hay horquilla. */
export type BaseEstimacion = 'parecidos' | 'toda-la-cartera' | null

export type Estimacion = {
  horquilla: Horquilla | null
  /**
   * Por qué NO hay horquilla, cuando no la hay. Nunca se calla: «no tengo
   * casos» y «he mirado y no sale negocio» son cosas distintas, y la pantalla
   * tiene que poder decir cuál de las dos es.
   */
  sinBase: string | null
  /** En cuántos casos se basa. Se enseña SIEMPRE junto a la horquilla. */
  casos: number
  desde: string | null
  hasta: string | null
  antiguedadMedianaMeses: number | null
  base: BaseEstimacion
  /** Frase lista para pintar. Existe para que no se pueda enseñar sin contexto. */
  etiqueta: string
  /** Literal: no se puede construir una Estimacion que se crea un precio firme. */
  orientativa: true
}

/** Con menos de esto no hay horquilla: tres casas no son un mercado. */
export const MINIMO_CASOS = 3

/**
 * Más viejo que esto, fuera.
 *
 * Es la forma explicable de «pierde peso con el tiempo»: un peso continuo daría
 * una precisión que estos datos no tienen y que nadie sabría explicar cuando
 * Alberto pregunte de dónde sale el número. Se excluye lo caduco y se enseña la
 * antigüedad mediana para que el que mira juzgue por su cuenta.
 */
export const MESES_MAXIMOS = 24

/** Con 8 o más casos se descarta el más caro y el más barato: suelen ser el caso raro. */
const CASOS_PARA_RECORTAR = 8

const mesesEntre = (desde: string, hasta: string): number => {
  const a = new Date(`${desde}T00:00:00Z`)
  const b = new Date(`${hasta}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.POSITIVE_INFINITY
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

const mediana = (xs: number[]): number => {
  const o = [...xs].sort((p, q) => p - q)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2
}

/**
 * ¿Es este caso comparable con el riesgo que queremos estimar?
 *
 * Superficie manda: un piso de 76 m² y un chalet de 350 m² no se parecen en
 * nada aunque compartan código postal. El año es secundario y con banda ancha.
 * Un dato que falta NO descarta el caso — descartarlo por no saber sería
 * confundir «no lo sé» con «no se parece».
 */
function esParecido(c: Caso, r: RiesgoAEstimar): boolean {
  if (r.metrosCuadrados !== null && c.metrosCuadrados !== null) {
    const margen = Math.max(30, r.metrosCuadrados * 0.4)
    if (Math.abs(c.metrosCuadrados - r.metrosCuadrados) > margen) return false
  }
  if (r.anioConstruccion !== null && c.anioConstruccion !== null) {
    if (Math.abs(c.anioConstruccion - r.anioConstruccion) > 30) return false
  }
  return true
}

function construir(casos: Caso[], base: Exclude<BaseEstimacion, null>, hoy: string): Estimacion {
  const primas = [...casos].map((c) => c.primaEur).sort((p, q) => p - q)
  const usadas = primas.length >= CASOS_PARA_RECORTAR ? primas.slice(1, -1) : primas

  const fechas = casos.map((c) => c.fecha).sort()
  const horquilla: Horquilla = {
    minEur: usadas[0]!,
    medianaEur: mediana(usadas),
    maxEur: usadas[usadas.length - 1]!,
  }
  const antiguedad = Math.round(mediana(casos.map((c) => mesesEntre(c.fecha, hoy))))

  const deQue = base === 'parecidos' ? 'casos parecidos' : 'toda la cartera'
  const antigua =
    antiguedad <= 1 ? 'de este mes' : `con una antigüedad mediana de ${antiguedad} meses`

  return {
    horquilla,
    sinBase: null,
    casos: casos.length,
    desde: fechas[0]!,
    hasta: fechas[fechas.length - 1]!,
    antiguedadMedianaMeses: antiguedad,
    base,
    etiqueta:
      `Estimación orientativa, no es un precio: ${eur(horquilla.minEur)}–${eur(horquilla.maxEur)} ` +
      `sobre ${casos.length} ${deQue} ${antigua}.`,
    orientativa: true,
  }
}

function sin(motivo: string, casos: number): Estimacion {
  return {
    horquilla: null,
    sinBase: motivo,
    casos,
    desde: null,
    hasta: null,
    antiguedadMedianaMeses: null,
    base: null,
    etiqueta: motivo,
    orientativa: true,
  }
}

/**
 * Construye la horquilla para un riesgo, a partir de los casos conocidos.
 *
 * Degrada de forma honesta: si no hay bastantes casos PARECIDOS, usa todos los
 * de la cartera y lo DICE en `base` y en la etiqueta. Callarse es peor que dar
 * una horquilla burda diciendo que es burda.
 */
export function estimar(casos: Caso[], riesgo: RiesgoAEstimar, hoy: string): Estimacion {
  const vigentes = casos.filter(
    (c) => c.primaEur > 0 && mesesEntre(c.fecha, hoy) <= MESES_MAXIMOS,
  )
  if (vigentes.length === 0) {
    return sin(
      casos.length === 0
        ? 'Todavía no hay ningún caso con el que comparar.'
        : `Los ${casos.length} casos que hay son de hace más de ${MESES_MAXIMOS} meses: las tarifas ya han cambiado.`,
      0,
    )
  }

  const parecidos = vigentes.filter((c) => esParecido(c, riesgo))
  if (parecidos.length >= MINIMO_CASOS) return construir(parecidos, 'parecidos', hoy)
  if (vigentes.length >= MINIMO_CASOS) return construir(vigentes, 'toda-la-cartera', hoy)

  return sin(
    `Solo hay ${vigentes.length} caso${vigentes.length === 1 ? '' : 's'} reciente${
      vigentes.length === 1 ? '' : 's'
    }: hacen falta ${MINIMO_CASOS} para dar una horquilla.`,
    vigentes.length,
  )
}

// ─── La pregunta que de verdad importa: ¿gasto los 0,50€? ────────────────────

export type Veredicto = 'merece' | 'no-merece' | 'no-se'

/** Dentro de este margen alrededor de la mediana no nos mojamos. */
const MARGEN_DUDA = 0.1

/**
 * ¿Merece la pena pedir precio de verdad para esta póliza?
 *
 * 🚨 `no-se` es una respuesta de primera clase, no un fallo. Sin saber lo que
 * paga hoy, o sin horquilla, cualquier veredicto sería una moneda al aire — y
 * una moneda al aire disfrazada de recomendación es lo que hace gastar mal.
 */
export function mereceLaPena(
  primaActualEur: number | null,
  e: Estimacion,
): { veredicto: Veredicto; porque: string } {
  if (primaActualEur === null || primaActualEur <= 0) {
    return { veredicto: 'no-se', porque: 'No sabemos lo que paga hoy, así que no hay con qué comparar.' }
  }
  const h = e.horquilla
  if (h === null) return { veredicto: 'no-se', porque: e.sinBase ?? 'No hay horquilla con la que comparar.' }

  if (primaActualEur > h.maxEur) {
    return {
      veredicto: 'merece',
      porque: `Paga ${eur(primaActualEur)}, por encima de los ${eur(h.maxEur)} del caso más caro que hemos visto.`,
    }
  }
  if (primaActualEur < h.minEur) {
    return {
      veredicto: 'no-merece',
      porque: `Paga ${eur(primaActualEur)}, por debajo de los ${eur(h.minEur)} del caso más barato que hemos visto.`,
    }
  }

  const distancia = Math.abs(primaActualEur - h.medianaEur) / h.medianaEur
  if (distancia <= MARGEN_DUDA) {
    return {
      veredicto: 'no-se',
      porque: `Paga ${eur(primaActualEur)}, prácticamente la mediana (${eur(h.medianaEur)}): podría salir a favor o en contra.`,
    }
  }
  return primaActualEur > h.medianaEur
    ? {
        veredicto: 'merece',
        porque: `Paga ${eur(primaActualEur)}, por encima de la mediana de ${eur(h.medianaEur)}.`,
      }
    : {
        veredicto: 'no-merece',
        porque: `Paga ${eur(primaActualEur)}, por debajo de la mediana de ${eur(h.medianaEur)}.`,
      }
}
