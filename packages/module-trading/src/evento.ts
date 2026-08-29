// ¿El resultado de una operación vino de la SEÑAL o de un EVENTO que el modelo no modela?
//
// Caso fundacional (26-27/08/2026, NVDA). El libro paper abrió NVDA el 21/08 a 214,72 con stop en
// 203,22. La víspera de sus resultados cotizaba a 209,96 —ya en pérdida y a un 3,3% del stop— y el
// 27/08, tras publicar, abrió con un hueco del +6,79%. La posición terminó en verde, pero ese verde
// no lo produjo ninguna de las cuatro estrategias del torneo: lo produjo un evento de calendario.
// Simétricamente, un hueco del −7% habría abierto POR DEBAJO del stop, así que la pérdida tampoco
// habría sido la que el dimensionado creía estar arriesgando.
//
// El problema no era la decisión, era el REGISTRO: la fecha de resultados se usaba (barrera
// `earningsInminente` y estrategia `catalizador`) pero no se persistía en ninguna columna — solo
// quedaba como texto libre en `rationale` («earnings en 2d»). Sin ella no se puede responder con
// números a «¿cuánto del rendimiento del libro viene de días de evento y cuánto de la señal?», que
// es exactamente lo que hay que tener contestado ANTES de desplegar capital real.
//
// Este módulo NO decide nada: no veta, no dimensiona y no toca la confianza de ninguna estrategia.
// Solo etiqueta. Cambiar el comportamiento a partir de esta etiqueta es un cambio de MODELO y va por
// `docs/TRADING-HIPOTESIS-PREREGISTRO.md`; etiquetar es un arreglo de DATOS. Son carriles distintos.

/**
 * Qué sabemos de la fecha de resultados de un símbolo, en el momento de escribir la fila.
 *
 * Tres estados, no dos (regla de la casa: `NULL` ≠ «no hay»). Una fecha nula puede significar dos
 * cosas OPUESTAS —que la fuente no se consultó, o que se consultó y no publica fecha— y colapsarlas
 * convertiría un «no lo sé» en un «no hay evento», que es justo la afirmación que contamina el
 * track record.
 *
 * - `sin_consultar`: la fuente no respondió (Yahoo caído, símbolo nuevo, pasada degradada).
 * - `con_fecha`: hay fecha conocida en el momento de escribir.
 * - `sin_fecha`: la fuente respondió y no da fecha (no es lo mismo que no haberla mirado).
 * - `reconstruido`: la fecha NO se leyó de una fuente, se dedujo a posteriori de un texto ya escrito
 *   (el backfill desde `rationale`). Es una reconstrucción, no una medición, y viaja etiquetada para
 *   que nadie la agregue junto a las demás sin saberlo.
 */
export type EstadoEarnings = 'sin_consultar' | 'con_fecha' | 'sin_fecha' | 'reconstruido'

/**
 * Si un evento cayó DENTRO de la ventana en la que se midió el resultado.
 *
 * - `cruzado`: hubo resultados entre la apertura y el cierre de la ventana → el retorno NO es
 *   atribuible solo a la señal.
 * - `limpio`: sabíamos la fecha (o sabíamos que no había) y el evento queda fuera.
 * - `sin_consultar`: no lo sabemos. NO es `limpio`. Se cuenta aparte y nunca se suma a ninguno de
 *   los dos: un agregado que mete los «no lo sé» en el montón bueno miente a favor del agente.
 */
export type CruceEvento = 'cruzado' | 'limpio' | 'sin_consultar'

/**
 * Estado a partir de lo que devolvió la fuente. `consultado` distingue «no pregunté» de «pregunté y
 * no hay», que es toda la razón de ser de este tipo.
 */
export function estadoEarnings(consultado: boolean, fecha: string | null | undefined): EstadoEarnings {
  if (!consultado) return 'sin_consultar'
  return fecha ? 'con_fecha' : 'sin_fecha'
}

/** Fechas ISO (YYYY-MM-DD) en ms UTC. Devuelve NaN si no es una fecha legible. */
function ms(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()
}

/**
 * ¿Cayó el evento dentro de [desde, hasta]?
 *
 * Ambos extremos INCLUIDOS a propósito. Los resultados se publican casi siempre después del cierre
 * (`post-market`), así que el evento del día D mueve el precio de D+1: incluir los bordes marca como
 * `cruzado` algún caso cuyo movimiento cae justo fuera de la ventana medida. Es el error que
 * queremos: marcar de más deja una operación fuera del montón «limpio», marcar de menos le atribuye
 * a la señal un movimiento que no produjo. Ante la duda, el estado conservador.
 *
 * Sin fecha conocida no se inventa nada: `sin_fecha` es `limpio` (la fuente dijo que no hay) y
 * `sin_consultar` se propaga tal cual.
 */
export function cruzaEvento(
  fecha: string | null | undefined,
  estado: EstadoEarnings,
  desde: string,
  hasta: string,
): CruceEvento {
  if (estado === 'sin_consultar') return 'sin_consultar'
  if (!fecha) return 'limpio'
  const e = ms(fecha)
  const a = ms(desde)
  const b = ms(hasta)
  if (Number.isNaN(e) || Number.isNaN(a) || Number.isNaN(b)) return 'sin_consultar'
  const ini = Math.min(a, b)
  const fin = Math.max(a, b)
  return e >= ini && e <= fin ? 'cruzado' : 'limpio'
}

/** Fecha ISO `dias` naturales después de `desde`. Ventana de medición de una tesis. */
export function finDeVentana(desde: string, dias: number): string {
  const d = new Date(ms(desde) + dias * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export type ParticionEvento<T> = { cruzado: T[]; limpio: T[]; sinConsultar: T[] }

/** Parte una lista en los tres montones. Ninguno se funde con otro. */
export function partirPorEvento<T>(items: T[], cruceDe: (item: T) => CruceEvento): ParticionEvento<T> {
  const out: ParticionEvento<T> = { cruzado: [], limpio: [], sinConsultar: [] }
  for (const it of items) {
    const c = cruceDe(it)
    if (c === 'cruzado') out.cruzado.push(it)
    else if (c === 'limpio') out.limpio.push(it)
    else out.sinConsultar.push(it)
  }
  return out
}

export type AtribucionEvento = {
  /** Retorno medio de los resultados SIN evento dentro. `null` si no hay ninguno (no 0). */
  medioLimpio: number | null
  /** Retorno medio de los que SÍ cruzaron un evento. `null` si no hay ninguno (no 0). */
  medioCruzado: number | null
  nLimpio: number
  nCruzado: number
  /** Cuántos no se pueden clasificar. Se publica SIEMPRE: es la medida de lo que no sabemos. */
  nSinConsultar: number
}

/**
 * Retorno medio partido por si hubo evento dentro de la ventana.
 *
 * Cada media es `null` cuando su montón está vacío — nunca 0, que se leería como «midió y salió
 * plano». Los `sin_consultar` NO entran en ninguna media; se cuentan aparte.
 */
export function atribuirPorEvento<T>(
  items: T[],
  cruceDe: (item: T) => CruceEvento,
  retornoDe: (item: T) => number,
): AtribucionEvento {
  const p = partirPorEvento(items, cruceDe)
  const media = (xs: T[]) => (xs.length ? xs.reduce((a, b) => a + retornoDe(b), 0) / xs.length : null)
  return {
    medioLimpio: media(p.limpio),
    medioCruzado: media(p.cruzado),
    nLimpio: p.limpio.length,
    nCruzado: p.cruzado.length,
    nSinConsultar: p.sinConsultar.length,
  }
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`

/**
 * Línea para el resumen de la pasada. Cadena vacía cuando no hay NADA que decir (ni eventos ni
 * huecos de conocimiento), para no añadir ruido a un Telegram que ya es largo.
 *
 * Dice explícitamente lo que no se sabe: un resumen que solo canta el montón limpio es el mismo
 * fallo que un semáforo verde porque la consulta no devolvió nada.
 */
export function resumenAtribucion(a: AtribucionEvento): string {
  if (a.nCruzado === 0 && a.nSinConsultar === 0) return ''
  const partes: string[] = []
  if (a.nCruzado > 0) {
    partes.push(
      `${a.nCruzado} con resultados dentro de la ventana (medio ${a.medioCruzado === null ? 's/d' : pct(a.medioCruzado)})`,
    )
    partes.push(`${a.nLimpio} sin evento (medio ${a.medioLimpio === null ? 's/d' : pct(a.medioLimpio)})`)
  }
  if (a.nSinConsultar > 0) partes.push(`${a.nSinConsultar} sin fecha comprobada`)
  return `📅 ${partes.join(' · ')}`
}
