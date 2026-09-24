// De las garantías de una póliza de hogar al CAPITAL ASEGURADO. PURO.
//
// 🚨 ESTO ES UNA MULETA, NO EL DISEÑO BUENO — y conviene saberlo antes de leer
// una línea más. El estándar EIAC **SÍ manda el capital etiquetado**: §13.99
// `tipo_capital` es una lista de `Capital`, y cada uno lleva CUATRO campos, tres
// de ellos obligatorios:
//
//     Bien                claves_bien                 1..1   ← CONTINENTE / CONTENIDO / OVJ / RC…
//     ModalidadValoracion claves_modalidadvaloracion  1..1
//     Importe             _t_num2dec                  1..1
//     Descripcion         xs:string                   0..1
//
// (`claves_bien`, §13.3.72: CONTENIDO · CONTINENTE · CA · RC · RCC ·
// MERCADERIAS · OVJ · OTROS.)
//
// Y `seguros.poliza_coberturas` guarda TRES de los cuatro —`modalidad_valoracion`,
// `capital_asegurado`, `descripcion_capital`— y **tira precisamente `Bien`**, que
// es el que dice de qué es el capital. No hay ni tabla `bienes` ni columna donde
// caiga (medido el 02/09/2026). Los importes son buenos; lo que se pierde en la
// ingesta es la etiqueta.
//
// El arreglo de verdad es una columna y que la ingesta la escriba. Mientras eso
// no exista, este módulo reconstruye el capital desde lo que SÍ se guardó. Si
// algún día llega `Bien`, esto se borra: leer la etiqueta siempre será mejor que
// deducirla.
//
// ─── DOS fuentes, y rotuladas ───────────────────────────────────────────────
// 🚨 Corregido el 03/09/2026. Hasta ese día este módulo miraba SOLO las
// garantías, y la ficha de Occident `GPDFS3000276` pintaba «sin dato» en
// continente y contenido diciendo que la suma asegurada «viaja en el campo
// Bien, que la ingesta todavía no guarda». Era mentira dos veces: la copia de
// esa misma póliza en el volcado tenía `{"continente":"61000","contenido":
// "7000"}` guardado, y la pantalla YA estaba leyendo ese mismo objeto para
// pintar «76 m² · construida en 1994». Cogía unos campos y no otros, y luego
// afirmaba que el dato no constaba: un «no lo he mirado» disfrazado de «no lo
// hay». Medido: afecta a 7 de las 19 pólizas de hogar vivas.
//
// Así que hay DOS fuentes y NO se mezclan:
//
//   1. `consenso`      — lo dicen varias garantías de la póliza VIVA (CIMA, hoy).
//   2. `del_volcado`   — la copia histórica de la misma póliza (junio de 2026).
//
// El consenso gana siempre. El volcado solo entra cuando el consenso no existe,
// y entra con su rótulo puesto: un capital de 2026 presentado como el de hoy es
// PEOR que un hueco, porque sobre él se decide si el cliente está
// infraasegurado. Por eso `del_volcado` es un estado aparte y no un `consenso`
// con otro motivo, y por eso `eurDeCapital()` sigue sin devolverlo.
//
// ─── El problema, medido el 02/09/2026 sobre las 19 pólizas de hogar vivas ──
// CIMA trae las coberturas enteras (716 filas, 365 con capital), pero NINGUNA
// compañía manda una fila que diga «este es el continente». Manda un capital
// POR GARANTÍA, y cada una las nombra a su manera:
//
//   compañía A (9 pólizas):  «daños vivienda» · «robo vivienda» · «roturas
//                             vivienda» · «daños por agua mobiliario» …
//   compañía B (10 pólizas): «robo del continente» · «hurto de contenido» …
//                             (peligros con la palabra dentro, y sin capital)
//
// 🚨 Y en la compañía B la respuesta correcta es «no lo informa». Medido sobre
// las dos vivas de un cliente real: de sus 40-55 garantías, las CUATRO que
// nombran continente o contenido vienen con capital NULL, y todo lo que trae
// importe es sublímite (300€, 1.000€, 5.894,43€…) o RESPONSABILIDAD CIVIL
// (353.665,88€). O sea: aquí no hay capital que reconstruir, y decirlo es la
// respuesta buena — el capital viaja en el `Bien` del EIAC que la ingesta tira.
//
// 🚨 Por eso la regla obvia —«lo que ponga vivienda es el continente»— es una
// TRAMPA: `roturas vivienda` también dice vivienda y vale 1.500€. Cogerlo como
// continente daría un capital plausible y falso, que es el modo de fallo más
// caro de este repo (ver `CLAUDE.md`, el dato que sí está pero se lee mal).
//
// ─── La regla que sí se sostiene: CORROBORACIÓN ─────────────────────────────
// Medido: en cada póliza, el capital asegurado es el importe que REPITEN seis o
// siete garantías del mismo lado, y siempre es el mayor; los sublímites los
// lleva UNA sola garantía. Ejemplos reales (agregados, sin cliente):
//
//   vivienda   912.322€ ×6 garantías   ·  500.480€ ×7  ·  55.902€ ×6
//   sublímites  63.492€ ×1             ·    1.500€ ×1
//
// Así que no se elige por el NOMBRE de la garantía sino por cuántas coinciden.
// Es explicable cuando Alberto pregunte de dónde sale el número —«lo dicen seis
// garantías de esta póliza»— y degrada sola: si nadie corrobora, no hay capital
// y se dice por qué, en vez de coger el máximo y cruzar los dedos.

import { interpretarCapital } from './cobertura-detalle.ts'

/** Qué mitad del riesgo cubre la garantía. `null` = no se sabe, y no se fuerza. */
export type LadoRiesgo = 'vivienda' | 'mobiliario'

export type CoberturaLeible = {
  descripcion: string | null | undefined
  capital: string | null | undefined
}

/**
 * Cuántas garantías tienen que coincidir para creerse que es el capital.
 *
 * Tres: cómodamente por debajo de las 6-7 que se miden en la cartera real, y
 * muy por encima del 1 de los sublímites. Subirlo a 6 dejaría fuera pólizas con
 * menos garantías contratadas; bajarlo a 2 empezaría a colar coincidencias.
 */
export const GARANTIAS_MINIMAS_CONSENSO = 3

export type CapitalAsegurado =
  /** Varias garantías coinciden en el importe: eso es la suma asegurada. */
  | { estado: 'consenso'; eur: number; garantias: number; ejemplo: string | null }
  /**
   * El importe NO sale de las garantías de hoy: sale de la copia de esta misma
   * póliza en el volcado histórico. Es un estado APARTE del consenso a
   * propósito — su procedencia es distinta y quien lo pinte tiene que poder
   * decirlo. Ver `CAPITAL_DEL_VOLCADO_MOTIVO`.
   */
  | { estado: 'del_volcado'; eur: number; motivo: string }
  /**
   * Hay capitales, pero cada uno en una sola garantía. Son sublímites y NO se
   * puede saber cuál era la suma asegurada — coger el mayor sería inventarla.
   */
  | { estado: 'solo_sublimites'; motivo: string; mayorEur: number }
  /** La compañía manda 0 en todas: es un dato («no lleva capital propio»), no un hueco. */
  | { estado: 'todo_cero'; motivo: string }
  /** Hay garantías de ese lado pero ninguna trae capital. */
  | { estado: 'sin_capital'; motivo: string }
  /** Ni siquiera hay garantías reconocibles de ese lado. */
  | { estado: 'sin_garantias'; motivo: string }

/**
 * ¿Este nombre de garantía cubre la vivienda o el mobiliario?
 *
 * Solo mira el vocabulario MEDIDO en la cartera. Lo que no encaje devuelve
 * `null` y queda fuera del recuento: una garantía sin clasificar no estropea el
 * consenso, solo no suma.
 */
export function ladoDeGarantia(descripcion: string | null | undefined): LadoRiesgo | null {
  if (typeof descripcion !== 'string') return null
  const d = descripcion.toLowerCase()
  // 🚨 La RESPONSABILIDAD CIVIL sale antes que nada, y no es un detalle: en EIAC
  // (§13.3.72 `claves_bien`) `RC` es un bien DISTINTO de `CONTINENTE`, y sin
  // embargo su garantía suele llamarse «responsabilidad civil del INMUEBLE».
  // Medido el 02/09/2026 sobre las dos de Occident vivas: colaba 353.665,88€
  // en el lado de la vivienda y la ficha los presentaba como un sublímite del
  // continente. Un límite de RC no es capital de nada del continente.
  if (d.includes('responsabilidad civil')) return null
  // Luego el continente: «desperfectos al CONTINENTE por robo» lleva las dos
  // palabras y lo que asegura es el continente.
  if (d.includes('vivienda') || d.includes('continente') || d.includes('inmueble') || d.includes('edificio')) {
    return 'vivienda'
  }
  if (d.includes('mobiliario') || d.includes('contenido') || d.includes('ajuar')) return 'mobiliario'
  return null
}

/**
 * Lo que la copia del volcado dice de UN lado. `undefined`/`null` = no se ha
 * mirado; un objeto = se miró (aunque `importe` venga vacío).
 *
 * 🚨 La distinción es la regla dura del repo: «dato que NO hay» ≠ «dato que NO
 * se ha mirado». Solo cuando se ha mirado se puede escribir en el motivo que la
 * copia del volcado tampoco lo trae.
 */
export type CapitalVolcado = {
  /** El importe tal cual está guardado, que en el volcado es TEXTO: «61000». */
  importe: unknown
}

/** Los dos lados de la copia del volcado. */
export type CapitalesVolcado = { continente: unknown; contenido: unknown }

/**
 * El importe del volcado, o `null`.
 *
 * Viene como texto y hay que desconfiar de él: `''`, `'0'`, `'-'` y cualquier
 * cosa no numérica son AUSENCIA, nunca un capital de 0€. Mismas reglas que
 * `hogarDeDatos` en la app (`num()`), para que la ficha y el tarificador no
 * lean el mismo campo de dos maneras distintas.
 */
export function importeDelVolcado(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * El rótulo de procedencia, palabra por palabra. Vive aquí y no en la UI porque
 * es lo ÚNICO que impide leer un capital de 2026 como el capital de hoy: un
 * importe viejo presentado como actual es peor que un hueco, porque sobre él se
 * decide si el cliente está infraasegurado.
 */
export const CAPITAL_DEL_VOLCADO_MOTIVO =
  'Sale de la copia de esta misma póliza en el volcado histórico (junio de 2026), NO de lo que manda hoy la ' +
  'compañía: es el capital que había entonces y puede estar desactualizado. Las garantías que CIMA manda hoy ' +
  'no lo corroboran.'

/** Coletilla para los estados sin importe: solo se escribe si se MIRÓ el volcado. */
const SIN_VOLCADO = ' La copia de esta póliza en el volcado tampoco trae un importe para este lado.'

/**
 * El capital asegurado de un lado, por corroboración entre garantías.
 *
 * Nunca devuelve un número sin decir de dónde sale: `consenso` dice en cuántas
 * garantías se apoya, y `del_volcado` dice que no viene de las garantías. Es lo
 * que separa «912.322€ porque lo dicen seis» de «912.322€ porque era el mayor».
 *
 * `volcado` es la copia del volcado de ESE lado. Solo se mira cuando las
 * garantías no dan consenso: lo que manda CIMA hoy gana siempre a una foto de
 * junio de 2026.
 */
export function capitalAsegurado(
  coberturas: readonly CoberturaLeible[],
  lado: LadoRiesgo,
  volcado?: CapitalVolcado | null,
): CapitalAsegurado {
  const porGarantias = capitalPorGarantias(coberturas, lado)
  // El consenso es el dato de la póliza VIVA. Nada lo desbanca.
  if (porGarantias.estado === 'consenso') return porGarantias

  if (volcado) {
    const eur = importeDelVolcado(volcado.importe)
    if (eur !== null) return { estado: 'del_volcado', eur, motivo: CAPITAL_DEL_VOLCADO_MOTIVO }
    // Se miró y no había. Eso SÍ se puede decir, y solo en este caso.
    return { ...porGarantias, motivo: porGarantias.motivo + SIN_VOLCADO }
  }
  return porGarantias
}

/** Lo que dicen SOLO las garantías. Sin el consenso, ningún estado trae importe. */
function capitalPorGarantias(
  coberturas: readonly CoberturaLeible[],
  lado: LadoRiesgo,
): Exclude<CapitalAsegurado, { estado: 'del_volcado' }> {
  const delLado = coberturas.filter((c) => ladoDeGarantia(c.descripcion) === lado)
  if (delLado.length === 0) {
    return { estado: 'sin_garantias', motivo: `La póliza no trae ninguna garantía de ${lado}.` }
  }

  let ceros = 0
  const importes: { eur: number; descripcion: string | null }[] = []
  for (const c of delLado) {
    const cap = interpretarCapital(c.capital)
    if (cap.tipo === 'sin_capital') ceros++
    else if (cap.tipo === 'importe') {
      importes.push({ eur: cap.importe, descripcion: typeof c.descripcion === 'string' ? c.descripcion : null })
    }
    // `sin_informar`, `ilimitado` y `texto` no cuentan ni a favor ni en contra:
    // no son un importe con el que corroborar nada.
  }

  if (importes.length === 0) {
    return ceros > 0
      ? {
          estado: 'todo_cero',
          motivo:
            ceros === 1
              ? `La única garantía de ${lado} viene a 0: la compañía no le pone capital propio.`
              : `Las ${ceros} garantías de ${lado} vienen a 0: la compañía no les pone capital propio.`,
        }
      : {
          estado: 'sin_capital',
          // 🚨 Este texto decía «esta compañía las manda sin importe propio» y
          // que la suma asegurada «viaja en el campo Bien, que la ingesta
          // todavía no guarda». Las dos frases mentían en la ficha de Occident
          // GPDFS3000276 (03/09/2026): 11 de sus 40 coberturas SÍ traen capital
          // —sublímites y RC, ninguno de este lado— y la suma asegurada SÍ
          // estaba guardada, en la copia del volcado. Un «no lo he mirado»
          // disfrazado de «no lo hay». Ahora se afirma solo de ESTE lado y no
          // se dice nada de las demás garantías ni de dónde no está el dato.
          // 🔎 Y la parte del «campo Bien» va como HIPÓTESIS, no como hecho: lo
          // medido el 03/09/2026 es que en las 19 pólizas de hogar vivas hay
          // 37 garantías de continente/contenido y NINGUNA trae capital, o sea
          // que la compañía no lo manda ahí. Dónde sí lo manda no se ha visto:
          // el EIAC no se lee desde este repo. Por eso dice «suele».
          motivo:
            (delLado.length === 1
              ? `La única garantía de ${lado} no trae capital propio `
              : `Ninguna de las ${delLado.length} garantías de ${lado} trae capital propio `) +
            `(de las demás garantías de la póliza esto no dice nada: pueden traer sus sublímites). ` +
            `La compañía no manda la suma asegurada de ${lado} en ninguna garantía; suele viajar en el bloque de ` +
            `«Bien»/riesgo del EIAC, que la ingesta todavía no guarda.`,
        }
  }

  // Cuántas garantías repiten cada importe. Los céntimos entran en la clave: dos
  // importes que difieren en un céntimo son dos importes distintos, no el mismo.
  const porImporte = new Map<number, { veces: number; ejemplo: string | null }>()
  for (const i of importes) {
    const previo = porImporte.get(i.eur)
    if (previo) previo.veces++
    else porImporte.set(i.eur, { veces: 1, ejemplo: i.descripcion })
  }

  // Entre los que llegan al mínimo, el MAYOR: el capital asegurado siempre está
  // por encima de sus sublímites, y si dos grupos corroboran (p. ej. una garantía
  // con su propio tope repetido) el de arriba es la suma asegurada.
  let mejor: { eur: number; veces: number; ejemplo: string | null } | null = null
  for (const [eur, { veces, ejemplo }] of porImporte) {
    if (veces < GARANTIAS_MINIMAS_CONSENSO) continue
    if (mejor === null || eur > mejor.eur) mejor = { eur, veces, ejemplo }
  }

  if (mejor === null) {
    const mayorEur = Math.max(...importes.map((i) => i.eur))
    return {
      estado: 'solo_sublimites',
      motivo:
        `Los capitales de ${lado} van cada uno por su cuenta (ninguno se repite en ` +
        `${GARANTIAS_MINIMAS_CONSENSO} garantías), así que son sublímites y no se sabe cuál era la suma asegurada.`,
      mayorEur,
    }
  }
  return { estado: 'consenso', eur: mejor.eur, garantias: mejor.veces, ejemplo: mejor.ejemplo }
}

export type CapitalesHogar = { continente: CapitalAsegurado; contenido: CapitalAsegurado }

/**
 * Los dos capitales que pide el tarificador de hogar, cada uno con su porqué.
 *
 * `volcado` son los capitales de la copia de ESTA misma póliza en el volcado
 * (`datos_especificos.continente` / `.contenido`, que vienen como texto).
 * Omitirlo NO es «no hay volcado», es «no se ha mirado» — y entonces los
 * motivos no dicen nada de él.
 */
export function capitalesHogar(
  coberturas: readonly CoberturaLeible[],
  volcado?: CapitalesVolcado | null,
): CapitalesHogar {
  return {
    continente: capitalAsegurado(coberturas, 'vivienda', volcado ? { importe: volcado.continente } : null),
    contenido: capitalAsegurado(coberturas, 'mobiliario', volcado ? { importe: volcado.contenido } : null),
  }
}

/**
 * El euro si lo hay, `null` si no. Para quien solo quiera el número y ya sepa
 * que puede faltar.
 *
 * 🚨 `del_volcado` NO sale por aquí: es un capital de junio de 2026 sin rótulo
 * de procedencia, y quien pide «solo el número» lo metería en un cálculo como
 * si fuera el de hoy. Para eso está `eurDeCapitalConVolcado`, que obliga a
 * escribir el nombre y por tanto a saber lo que se coge.
 */
export function eurDeCapital(c: CapitalAsegurado): number | null {
  return c.estado === 'consenso' ? c.eur : null
}

/** El euro venga del consenso o del volcado. Úsalo solo donde un dato viejo valga más que un hueco. */
export function eurDeCapitalConVolcado(c: CapitalAsegurado): number | null {
  return c.estado === 'consenso' || c.estado === 'del_volcado' ? c.eur : null
}
