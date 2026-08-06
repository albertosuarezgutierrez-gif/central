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
  /** días desde la última medición fiable; `null` = nunca medida (lo más urgente) */
  diasSinMedir: number | null
  comps: number
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
 *   2. **Ronda base antes que evento** SOLO cuando ambas están sin medir: la línea de temporada es
 *      lo que hace elegible el bucket mensual del motor (exige ≥3 fechas distintas del mes), y sin
 *      bucket no hay temporada que aplicar a los otros 28 días del mes.
 *   3. A igualdad, **la fecha más cercana primero**: es la que ya se está vendiendo.
 *
 * `hoyIso` entra como parámetro (no `new Date()`) para que la función sea pura y testeable.
 */
export function ventanasQuePedir(
  plan: Ventana[],
  aforos: Map<number, string[]>,
  cobertura: CoberturaVentana[],
  hoyIso: string,
  max = 12,
): VentanaPedida[] {
  const porClave = new Map<string, CoberturaVentana>()
  for (const c of cobertura) porClave.set(clave(c.checkin, c.aforo), c)

  const pedidas: VentanaPedida[] = []
  for (const v of plan) {
    for (const [aforo, pisos] of aforos) {
      if (!pisos.length) continue
      const c = porClave.get(clave(v.checkin, aforo))
      const diasSinMedir = c?.ultimaMedicion ? diasEntre(c.ultimaMedicion, hoyIso) : null
      pedidas.push({
        checkin: v.checkin,
        checkout: v.checkout,
        aforo,
        pisos,
        motivo: v.motivo,
        etiqueta: v.etiqueta,
        ronda: v.ronda,
        diasSinMedir,
        comps: c?.comps ?? 0,
      })
    }
  }

  pedidas.sort((a, b) => {
    const aNunca = a.diasSinMedir === null
    const bNunca = b.diasSinMedir === null
    if (aNunca !== bNunca) return aNunca ? -1 : 1
    if (aNunca && bNunca) {
      // Ambas vírgenes: manda la ronda (base → evento → profundidad) y luego la cercanía.
      if (a.ronda !== b.ronda) return a.ronda - b.ronda
      return a.checkin.localeCompare(b.checkin)
    }
    // Ambas medidas: la más vieja primero; empate → la fecha más cercana.
    if (a.diasSinMedir !== b.diasSinMedir) return (b.diasSinMedir ?? 0) - (a.diasSinMedir ?? 0)
    return a.checkin.localeCompare(b.checkin)
  })

  return pedidas.slice(0, Math.max(1, max))
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
}): string {
  const partes = [`${r.comps} comps reales en ${r.ventanas} ventanas`]
  if (r.sinRespuesta) {
    partes.push(
      `⚠️ ${r.sinRespuesta} ventanas sin respuesta del conector (NO es «no hay mercado»: no se ha podido mirar)`,
    )
  }
  if (r.sinPrecio) partes.push(`${r.sinPrecio} sin precio utilizable (respondió, no traía cifra)`)
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
