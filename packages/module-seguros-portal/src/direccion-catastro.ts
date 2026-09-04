// De una dirección tecleada por una persona a algo que el Catastro entienda —
// y de dónde salió cada dato una vez resuelto.
//
// Dos piezas que van juntas porque sirven al mismo paso de la pantalla de hogar:
//
//  1. `variantesDireccion()` — el intento BARATO y DETERMINISTA. La inmensa
//     mayoría de los «no lo encuentro» del Catastro no son direcciones raras:
//     son la misma dirección escrita de otra manera («C/» por «CALLE», el piso
//     pegado al número, acentos, «nº»). Probar esas variantes cuesta cero, no
//     se inventa nada y se puede testear. La IA solo tiene sentido DESPUÉS de
//     esto, para lo que de verdad es raro.
//
//  2. `OrigenCampo` — de dónde viene cada valor. 76 m² leídos del Catastro y
//     76 m² estimados a ojo por el cliente NO valen lo mismo, y hasta hoy la
//     póliza entera era `declarado` sin distinguir. Sin esto no se puede saber
//     sobre qué te estás apoyando al tarificar.
//
// 🚨 LA REGLA QUE SOSTIENE TODO ESTO: una variante es una PROPUESTA, nunca una
// respuesta. Se genera, se consulta al Catastro, y lo que vuelva se le ENSEÑA a
// la persona para que confirme que es su casa. Resolver por ella —quedarse con
// «la que más se parece»— mete los metros, el año y el código postal de OTRA
// vivienda en su póliza de hogar. Eso no da error, no se ve, y en un siniestro
// se paga como infraseguro: cobra menos de lo que creía. Es el mismo criterio
// que la fecha estimada desde la matrícula: se enseña, no se guarda.

/**
 * De dónde salió un campo concreto de `datos_ramo`.
 *
 * - `catastro`: lo dijo el Catastro y la persona lo aceptó. Dato de registro.
 * - `documento`: lo leyó la IA de un PDF o una foto que subió la persona.
 * - `declarado`: lo tecleó ella. Puede ser exacto o una estimación a ojo, y
 *   desde fuera no se distingue: por eso es el más débil de los tres.
 *
 * NO hay `calculado` ni `compania` aquí a propósito: esos existen en la
 * escalera de `procedencia.ts`, que responde a otra pregunta (quién afirma la
 * PÓLIZA). Esta responde de dónde viene UN CAMPO. Mezclarlas haría que un
 * `compania` por campo pareciera que la compañía confirmó los metros.
 */
export const ORIGENES_CAMPO = ['catastro', 'documento', 'declarado'] as const
export type OrigenCampo = (typeof ORIGENES_CAMPO)[number]

export function esOrigenCampo(v: unknown): v is OrigenCampo {
  return typeof v === 'string' && (ORIGENES_CAMPO as readonly string[]).includes(v)
}

/** `{ metrosCuadrados: 'catastro', anioConstruccion: 'declarado' }`. */
export type OrigenPorCampo = Readonly<Record<string, OrigenCampo>>

/**
 * Deja SOLO los orígenes de claves que existen de verdad en los datos, y con un
 * valor del vocabulario. Un origen huérfano —«el campo X vino del Catastro»
 * cuando X no está— es una afirmación sobre un dato que no existe, y es lo que
 * luego pinta un sello de «verificado» sobre un hueco.
 */
export function normalizarOrigenes(
  datos: Readonly<Record<string, unknown>> | null | undefined,
  origenes: unknown,
): OrigenPorCampo | null {
  if (!datos || !origenes || typeof origenes !== 'object' || Array.isArray(origenes)) return null
  const salida: Record<string, OrigenCampo> = {}
  for (const [k, v] of Object.entries(origenes as Record<string, unknown>)) {
    if (!(k in datos)) continue
    if (esOrigenCampo(v)) salida[k] = v
  }
  return Object.keys(salida).length === 0 ? null : salida
}

// ── La referencia catastral ────────────────────────────────────────────────

/**
 * 🚨 CATORCE CARACTERES NO SON TU CASA. La referencia catastral de **20** es la
 * del INMUEBLE (tu piso concreto). La de **14** es la de la FINCA: el edificio
 * entero, o la parcela. Aceptar una de 14 como si identificara la vivienda trae
 * los metros del edificio, no los del piso — un número plausible y equivocado,
 * que es el peor tipo de dato.
 *
 * Por eso esto devuelve QUÉ es, y no un booleano: quien llame tiene que poder
 * decirle a la persona «esa es la del edificio, necesitamos la de tu piso».
 */
export type FormatoReferencia = 'inmueble' | 'finca' | 'invalida'

export function normalizarReferencia(valor: string): string {
  return valor.toUpperCase().replace(/[\s.\-/]/g, '')
}

export function formatoReferencia(valor: string | null | undefined): FormatoReferencia {
  if (typeof valor !== 'string') return 'invalida'
  const r = normalizarReferencia(valor)
  if (!/^[A-Z0-9]+$/.test(r)) return 'invalida'
  if (r.length === 20) return 'inmueble'
  if (r.length === 14) return 'finca'
  return 'invalida'
}

// ── Variantes de una dirección ─────────────────────────────────────────────

/** Tope: por encima no es una dirección, es un pegado. */
export const MAX_DIRECCION = 200

/** Cuántas variantes se devuelven como mucho: cada una es una consulta al Catastro. */
export const MAX_VARIANTES = 6

/**
 * La misma dirección, escrita como el Catastro la espera. En orden de más
 * probable a menos, SIN la original (quien llama ya la ha probado).
 *
 * Determinista y sin red: las mismas entradas dan siempre las mismas salidas, y
 * eso es lo que permite testearlo. Si esto no encuentra nada, ENTONCES tiene
 * sentido preguntarle a una IA — no antes.
 */
export function variantesDireccion(direccion: string): readonly string[] {
  const base = direccion.trim()
  if (base === '' || base.length > MAX_DIRECCION) return []

  const vistas = new Set<string>([clave(base)])
  const salida: string[] = []
  const anadir = (v: string) => {
    const limpia = v.replace(/\s+/g, ' ').trim()
    if (limpia === '' || salida.length >= MAX_VARIANTES) return
    const k = clave(limpia)
    if (vistas.has(k)) return
    vistas.add(k)
    salida.push(limpia)
  }

  const sinAcentos = quitarAcentos(base)
  anadir(sinAcentos)

  const conSigla = expandirSigla(sinAcentos)
  anadir(conSigla)

  // Sin el interior (piso y puerta): el Catastro busca por vía y número, y el
  // «3º B» pegado detrás es justo lo que hace que no case.
  const sinInterior = quitarInterior(conSigla)
  anadir(sinInterior)

  // Sin el «nº»/«num.» delante del número.
  anadir(sinInterior.replace(/\b(n[ºo°]\.?|num\.?|numero)\s*/gi, ''))

  // Solo vía y primer número: el intento más amplio, el último.
  const soloViaNumero = sinInterior.match(/^(.*?\d+)/)
  if (soloViaNumero) anadir(soloViaNumero[1])

  return salida
}

function clave(v: string): string {
  return quitarAcentos(v).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function quitarAcentos(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * `C/` → `CALLE`, `Avda.` → `AVENIDA`… El callejero del Catastro trabaja con la
 * sigla larga; la corta es como la escribe la gente.
 */
const SIGLAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^c\/\s*/i, 'CALLE '],
  [/^c\.\s*/i, 'CALLE '],
  [/^cl\.?\s+/i, 'CALLE '],
  [/^avda?\.?\s+/i, 'AVENIDA '],
  [/^av\.?\s+/i, 'AVENIDA '],
  [/^pl(?:za)?\.?\s+/i, 'PLAZA '],
  [/^p[ºo°]\.?\s+/i, 'PASEO '],
  [/^ctra\.?\s+/i, 'CARRETERA '],
  [/^urb\.?\s+/i, 'URBANIZACION '],
  [/^trav\.?\s+/i, 'TRAVESIA '],
]

function expandirSigla(v: string): string {
  for (const [patron, largo] of SIGLAS) if (patron.test(v)) return v.replace(patron, largo)
  return v
}

/** Quita `3º B`, `Esc 2`, `Pl:02 Pt:14`, `bajo dcha`… todo lo que va tras el número. */
function quitarInterior(v: string): string {
  return v
    .replace(/\b(esc(alera)?|es|pl(anta)?|pt|pta|puerta|piso|bloque|bl)\b\.?\s*:?\s*[\w-]*/gi, ' ')
    .replace(/\b\d+\s*[ºo°ª]\s*[a-z]?\b/gi, ' ')
    .replace(/\b(bajo|entresuelo|atico|sotano)\b\s*[a-z]?/gi, ' ')
    .replace(/\b(izq(da)?|dcha|dch|drcha|centro)\b/gi, ' ')
    .replace(/[,;]\s*$/, '')
}
