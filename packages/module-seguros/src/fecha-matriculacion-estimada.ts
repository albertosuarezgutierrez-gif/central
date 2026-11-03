/**
 * Mes ESTIMADO de matriculación a partir de la matrícula, para rellenar
 * `fecha_matriculacion_estimada` donde la fecha REAL falta (30/10/2026).
 *
 * 🚨 No duplica la tabla de series: la única tabla de la DGT del monorepo vive
 * en `matricula.ts` (`SERIES_FIN_DE_MES`, 313 hitos mensuales sep-2000 → ago-2026,
 * fuentes y precisión medida documentadas allí: 94,5 % acierta el año exacto,
 * 96,6 % ±1 año sobre 1.430 vehículos de la cartera). Esto es solo la capa que
 *  1) reduce la estimación a MES (primer día) — la tabla tiene precisión
 *     mensual; el día interpolado de `matricula.ts` no es un dato y no se guarda;
 *  2) dice POR QUÉ no se estima, con un motivo cerrado, en vez de un `null` mudo.
 *
 * Regla del repo («dato que NO hay ≠ dato que NO se ha mirado»): el resultado va
 * a su PROPIO campo con su origen; jamás sobrescribe ni se pinta como la fecha
 * real. Y estima la matriculación ESPAÑOLA: un importado puede tener la primera
 * matriculación años antes (manda la ficha técnica).
 *
 * Formatos que NO se estiman (no van por la serie nacional ordinaria, o su
 * serie es propia): provincial anterior a sep-2000, ciclomotor `C`, remolque
 * `R`, histórica `H`, temporales `P`/`S`/`V`, especial `E`, diplomáticas
 * `CD`/`OI`/`TA` (la `CC` consular se confunde con Cáceres y cae en
 * `provincial`; ambas son no estimables, solo cambia el motivo). Con letras
 * fuera del alfabeto de la serie (vocales, Ñ, Q) → `formato_no_reconocido`.
 */

import {
  ALFABETO_SERIE,
  fechaMatriculacionEstimada,
  formatoMatricula,
  mesDeTramoMatricula,
  normalizarMatricula,
} from './matricula.ts'

export type MotivoNoEstimable =
  | 'vacia'
  | 'provincial'
  | 'ciclomotor'
  | 'remolque'
  | 'historica'
  | 'temporal'
  | 'especial'
  | 'diplomatica'
  | 'formato_no_reconocido'
  | 'fuera_de_tabla'

export type EstimacionMesMatriculacion =
  | { readonly mesAnio: string; readonly confianza: 'serie_nacional'; readonly motivo: 'serie_nacional' }
  | { readonly mesAnio: null; readonly confianza: 'no_estimable'; readonly motivo: MotivoNoEstimable }

const L = `[${ALFABETO_SERIE}]{3}`
// Letra de prefijo + 4 dígitos + 3 letras de la serie: series especiales con contador propio.
const RE_PREFIJO_SERIE = new RegExp(`^([RHPSVE])[0-9]{4}${L}$`)
const RE_DIPLOMATICA = /^(CD|OI|TA)[0-9]{1,6}$/

const MOTIVO_PREFIJO: Readonly<Record<string, MotivoNoEstimable>> = {
  R: 'remolque',
  H: 'historica',
  P: 'temporal',
  S: 'temporal',
  V: 'temporal',
  E: 'especial',
}

function no(motivo: MotivoNoEstimable): EstimacionMesMatriculacion {
  return { mesAnio: null, confianza: 'no_estimable', motivo }
}

/**
 * `hoy` (YYYY-MM-DD) solo hace falta para matrículas POSTERIORES al último mes
 * de la tabla; sin él esas salen `fuera_de_tabla` (no se extrapola a ciegas).
 */
export function estimarMesMatriculacion(valor: string, hoy?: string): EstimacionMesMatriculacion {
  const m = normalizarMatricula(typeof valor === 'string' ? valor : '')
  if (m === '') return no('vacia')

  const pref = RE_PREFIJO_SERIE.exec(m)
  if (pref) return no(MOTIVO_PREFIJO[pref[1]!]!)
  if (RE_DIPLOMATICA.test(m)) return no('diplomatica')

  const formato = formatoMatricula(m)
  if (formato === 'ciclomotor') return no('ciclomotor')
  if (formato === 'provincial') return no('provincial')
  if (formato !== 'moderna') return no('formato_no_reconocido')

  // Dentro de la tabla: el mes es el del TRAMO (no `estimada`, que redondea al día 1 del mes siguiente en el borde).
  const mes = mesDeTramoMatricula(m)
  if (mes) return { mesAnio: mes, confianza: 'serie_nacional', motivo: 'serie_nacional' }
  // Posterior a la tabla: solo con `hoy`, y entonces el mes del punto extrapolado (recortado a hoy).
  const est = hoy ? fechaMatriculacionEstimada(m, hoy) : null
  if (!est) return no('fuera_de_tabla')
  return { mesAnio: `${est.estimada.slice(0, 7)}-01`, confianza: 'serie_nacional', motivo: 'serie_nacional' }
}
