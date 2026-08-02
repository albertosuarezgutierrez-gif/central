// lib/sivra/resumen-sweep.ts — el parte del barrido de mercado, y por qué necesita uno.
//
// POR QUÉ (02/08/2026). La primera pasada vigilada del barrido (`mercado/sweep`) reportó
// «0 comps en 44 ventanas» y ahí se acababa la historia. Ese 0 podía significar dos cosas
// OPUESTAS y el código no sabía cuál:
//   · «he mirado el mercado y no había precios» → dato real, aburrido;
//   · «la búsqueda no devolvió NADA que leer» → no se ha mirado nada.
// Era lo segundo: las 44 búsquedas de ese día volvieron (casi) vacías —los 41 prompts que sí
// llegaron a la IA pesaban 149-278 tokens CONTANDO la respuesta, cuando el scraper diario que
// sí trae comps mueve 576-933— así que la IA contestó `{"apartments":[]}` porque no le dieron
// nada, no porque el mercado estuviera vacío. Ni `serperSearch` ni `extractPrices` distinguían
// el caso: el `catch { return [] }` de la extracción y un `organic: []` de la búsqueda acaban
// exactamente en el mismo 0.
//
// Es la misma lección que `resumen-escaneo.ts` (facturas de Gmail, esa misma mañana): un
// descarte mudo convierte un «no lo sé» en un «no hay». Aquí el precio de equivocarse es que
// el motor tarifica con el ancla global —más baja— en los meses buenos.
//
// Módulo PURO: sin Prisma, sin `@/`, testeable con `node --test`.

/**
 * Qué pasó en una ventana (fecha × aforo):
 * · `comps`          → se leyeron comparables. Es el único estado que MIDE algo.
 * · `sin_precios`    → hubo resultados y la IA los leyó, pero no traían precio. Ausencia REAL.
 * · `sin_resultados` → la búsqueda no devolvió nada. NO se ha mirado el mercado de esa fecha.
 * · `sin_leer`       → hubo resultados pero la IA no los pudo leer (fallo técnico). Tampoco.
 */
export type EstadoVentana = 'comps' | 'sin_precios' | 'sin_resultados' | 'sin_leer'

export type VentanaMedida = {
  /** YYYY-MM-DD */
  checkin: string
  aforo: number
  /** 0 = ronda base (la línea de temporada). Ver `mercado-ventanas.ts`. */
  ronda: number
  estado: EstadoVentana
  comps: number
  /** nombres de los comparables leídos (para detectar un corpus sin señal de temporada) */
  nombres?: string[]
  mediana?: number | null
}

export type ResumenBarrido = {
  /** filas escritas en `market_rates` */
  comps: number
  ventanas: VentanaMedida[]
  /** ventanas del plan que eran de evento */
  eventos: number
  /** ventanas que se quedaron sin tiempo */
  truncadas: number
  /** ¿se llegó a barrer la ronda base entera (una fecha de cada mes)? */
  baseCompleta: boolean
  errores: string[]
}

export function contarPorEstado(ventanas: VentanaMedida[]): Record<EstadoVentana, number> {
  const c: Record<EstadoVentana, number> = { comps: 0, sin_precios: 0, sin_resultados: 0, sin_leer: 0 }
  for (const v of ventanas) c[v.estado]++
  return c
}

/**
 * Ventanas de la RONDA BASE que se quedaron ciegas (ni resultados ni lectura). Es el número que
 * decide si la pasada vale: la ronda base es la línea de temporada, y un mes ciego ahí es un mes
 * que el motor va a tarificar con el ancla global sin que nadie lo sepa.
 */
export function cegadasEnBase(ventanas: VentanaMedida[]): number {
  return ventanas.filter(v => v.ronda === 0 && (v.estado === 'sin_resultados' || v.estado === 'sin_leer')).length
}

/**
 * `true` cuando el barrido trajo EXACTAMENTE los mismos comparables al mismo precio para todas
 * las fechas de un aforo (con 3 fechas o más). Entonces no se ha medido la temporada: se ha
 * fotografiado el mercado de hoy y se ha etiquetado con fechas futuras — un dato que parece
 * bueno y miente en la dirección más cara (noviembre valorado como agosto, o al revés).
 * Requiere que TODOS los aforos con muestra suficiente estén planos para no dar falsos positivos
 * (que dos findes cercanos compartan hoteles es normal).
 */
export function sinSenalDeTemporada(ventanas: VentanaMedida[]): boolean {
  const porAforo = new Map<number, VentanaMedida[]>()
  for (const v of ventanas) {
    if (v.estado !== 'comps') continue
    porAforo.set(v.aforo, [...(porAforo.get(v.aforo) ?? []), v])
  }
  let evaluados = 0
  for (const lista of porAforo.values()) {
    const fechas = new Set(lista.map(v => v.checkin))
    if (fechas.size < 3) continue
    evaluados++
    const claves = new Set(
      lista.map(v => `${[...(v.nombres ?? [])].sort().join('|')}#${v.mediana ?? ''}`),
    )
    if (claves.size > 1) return false
  }
  return evaluados > 0
}

/**
 * ¿Se puede afirmar que esta pasada ha medido el mercado? Conservador a propósito: ante la duda,
 * NO (un latido verde de mentira es peor que uno rojo de más).
 */
export function barridoFiable(r: ResumenBarrido): boolean {
  if (r.errores.length) return false
  if (!r.baseCompleta) return false
  if (cegadasEnBase(r.ventanas) > 0) return false
  if (contarPorEstado(r.ventanas).comps === 0) return false
  if (sinSenalDeTemporada(r.ventanas)) return false
  return true
}

/** Parte para el latido (y para el Telegram del vigía). Lo que NO se pudo mirar va primero. */
export function detalleBarrido(r: ResumenBarrido): string {
  const c = contarPorEstado(r.ventanas)
  const partes: string[] = [
    `${r.comps} comps en ${r.ventanas.length} ventanas (${r.eventos} de evento)`,
  ]

  if (c.sin_resultados) {
    partes.push(
      `⚠️ ${c.sin_resultados} búsquedas sin resultados (NO es «no hay mercado»: no se ha podido mirar)`,
    )
  }
  if (c.sin_leer) {
    partes.push(`⚠️ ${c.sin_leer} ventanas que la IA no supo leer`)
  }
  const ciegasBase = cegadasEnBase(r.ventanas)
  if (ciegasBase) partes.push(`⚠️ ${ciegasBase} de la ronda base ciegas: la línea de temporada tiene huecos`)
  if (sinSenalDeTemporada(r.ventanas)) {
    partes.push('⚠️ mismos comps y mismo precio en todas las fechas: el corpus NO refleja temporada')
  }
  if (c.sin_precios) partes.push(`${c.sin_precios} sin precios (leídas, no traían cifra)`)
  if (r.truncadas) {
    partes.push(
      `${r.truncadas} ventanas sin tiempo${r.baseCompleta ? ' (solo profundidad de bucket)' : ' INCLUIDA la base mensual'}`,
    )
  }
  if (r.errores.length) partes.push(`${r.errores.length} fallos: ${r.errores[0]}`)

  return partes.filter(Boolean).join(' · ')
}
