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

  // Quitar los acentos no genera variante POR SÍ SOLO —`clave()` ya los ignora,
  // así que saldría duplicada—, pero es la entrada de todo lo demás.
  const sinAcentos = quitarAcentos(base)

  // Dos maneras de escribir la MISMA vía: con la sigla larga, y además con las
  // abreviaturas de dentro desplegadas («Dr.» → «DOCTOR»), que es como suele
  // estar el callejero. Cuál acierta depende del municipio: se prueban las dos.
  const formas = [expandirSigla(sinAcentos)]
  const conTitulos = expandirTitulos(formas[0])
  if (clave(conTitulos) !== clave(formas[0])) formas.push(conTitulos)

  // De menos recorte a más: primero la dirección entera, luego sin el interior
  // (el Catastro busca por vía y número, y el «3º B» pegado detrás es justo lo
  // que hace que no case), luego sin el «nº», y al final solo vía y número.
  for (const f of formas) anadir(f)

  const sinInterior = formas.map(quitarInterior)
  for (const s of sinInterior) anadir(s)
  for (const s of sinInterior) anadir(quitarPalabraNumero(s))
  for (const s of sinInterior) {
    // Vía y número, nada más. Cortado por el MISMO ancla que el interior: un
    // `^(.*?\d+)` a pelo se quedaría con el primer número que pillara y
    // convertiría «Calle 28 de Febrero 5» en «Calle 28», que es otra dirección.
    const corte = finDelPortal(s)
    if (corte !== null) anadir(s.slice(0, corte))
  }

  return salida
}

function clave(v: string): string {
  return quitarAcentos(v).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function quitarAcentos(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Quita el «nº»/«num.»/«numero» que va delante del número de portal. */
function quitarPalabraNumero(v: string): string {
  return v.replace(/\b(n[ºo°]\.?|num\.?|numero)\s*/gi, '')
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
  [/^pza\.?\s+/i, 'PLAZA '],
  [/^p[ºo°]\.?\s+/i, 'PASEO '],
  [/^ctra\.?\s+/i, 'CARRETERA '],
  [/^urb\.?\s+/i, 'URBANIZACION '],
  [/^trav\.?\s+/i, 'TRAVESIA '],
  [/^ps?je\.?\s+/i, 'PASAJE '],
  [/^gta\.?\s+/i, 'GLORIETA '],
  [/^c(?:m?no|mo)\.?\s+/i, 'CAMINO '],
  [/^rda\.?\s+/i, 'RONDA '],
  [/^rbla\.?\s+/i, 'RAMBLA '],
  [/^bda\.?\s+/i, 'BARRIADA '],
  [/^b[ºo°]\.?\s+/i, 'BARRIO '],
  [/^c(?:j|ll)on\.?\s+/i, 'CALLEJON '],
  [/^cta\.?\s+/i, 'CUESTA '],
  [/^pol(?:ig)?\.?\s+/i, 'POLIGONO '],
  [/^prol\.?\s+/i, 'PROLONGACION '],
  [/^sda\.?\s+/i, 'SENDA '],
]

/**
 * Las siglas de vía de DOS letras del Catastro, tal cual vienen en los papeles
 * de una póliza («CL SAN VICENTE 40»).
 *
 * 🚨 Solo en MAYÚSCULAS y con un espacio detrás: así no hay forma de que se
 * coman el principio de un nombre de calle —ninguna vía española empieza por
 * una palabra de dos letras de esta lista—, que es lo que pasaría aceptando
 * «Co…» o «Cu…» en minúscula.
 */
const SIGLAS_CATASTRO: Readonly<Record<string, string>> = {
  CL: 'CALLE',
  AV: 'AVENIDA',
  PZ: 'PLAZA',
  PS: 'PASEO',
  CR: 'CARRETERA',
  CM: 'CAMINO',
  GL: 'GLORIETA',
  TR: 'TRAVESIA',
  RD: 'RONDA',
  BO: 'BARRIO',
  UR: 'URBANIZACION',
  PG: 'POLIGONO',
  CJ: 'CALLEJON',
  RB: 'RAMBLA',
  PJ: 'PASAJE',
  CU: 'CUESTA',
  CS: 'CASERIO',
  CO: 'COLONIA',
  VR: 'VEREDA',
  SD: 'SENDA',
  BR: 'BARRANCO',
}

function expandirSigla(v: string): string {
  for (const [patron, largo] of SIGLAS) if (patron.test(v)) return v.replace(patron, largo)
  const dos = v.match(/^([A-Z]{2})\s+(?=[A-Za-z])/)
  const largo = dos ? SIGLAS_CATASTRO[dos[1]] : undefined
  return largo ? `${largo} ${v.slice(dos![0].length)}` : v
}

/**
 * `Dr.` → `DOCTOR`, `Sta.` → `SANTA`… Siempre con el punto detrás: sin él,
 * «Sta» o «Sr» podrían ser el principio de una palabra de verdad.
 */
const TITULOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bdra\.\s*/gi, 'DOCTORA '],
  [/\bdr\.\s*/gi, 'DOCTOR '],
  [/\bsta\.\s*/gi, 'SANTA '],
  [/\bsto\.\s*/gi, 'SANTO '],
  [/\bgral\.\s*/gi, 'GENERAL '],
  [/\bntra\.\s*/gi, 'NUESTRA '],
  [/\bntro\.\s*/gi, 'NUESTRO '],
  [/\bsra\.\s*/gi, 'SENORA '],
  [/\bpque\.\s*/gi, 'PARQUE '],
]

function expandirTitulos(v: string): string {
  let salida = v
  for (const [patron, largo] of TITULOS) salida = salida.replace(patron, largo)
  return salida
}

// ── Quitar el interior (planta, puerta, escalera) ──────────────────────────
//
// 🚨 LO PELIGROSO NO ES DEJAR EL INTERIOR: ES COMERSE PARTE DE LA CALLE. «Calle
// Bajo Guía 12», «Avenida Ático Sur», «Calle Puerta Real 8», «Plaza del Portal
// 3» — si «bajo», «ático», «puerta» o «portal» se quitan estén donde estén,
// sale la dirección de OTRA vía. Y una variante mala no es neutra: si el
// Catastro la encuentra, devuelve otra vivienda, con sus metros y su año.
//
// Por eso todo esto está ANCLADO al número de portal: lo que va antes es el
// nombre de la vía y no se toca NUNCA; solo se limpia lo que va detrás.

/** Palabra que introduce un dato del interior, con su valor pegado o no: `Esc 2`, `Pl:02`, `Pta.3`. */
const CLAVE_INTERIOR = /^(?:esc|escal|escalera|pl|planta|pt|pta|prta|puerta|piso|portal|ptal|bloque|blq|bl|local|nave|vivienda|viv)[.:\-]?\s*-?\d{0,3}\s*[a-z]?$/

/** La planta escrita con palabras. */
const PLANTA_INTERIOR = /^(?:bajo|bajos|bj|entresuelo|entreplanta|entlo|atico|sotano|semisotano|principal|ppal)$/

/** La puerta escrita con palabras. */
const ORIENTACION_INTERIOR = /^(?:izq|izqd|izqda|izquierda|izquierdo|dcha|dch|dcho|drcha|derecha|centro|ctro)$/

/**
 * Un número de interior: `14`, `-1`, `3º`, `4ºC`, `12B`. Como mucho tres
 * cifras: cinco son un CÓDIGO POSTAL y ese se queda (es dato de la dirección,
 * no del interior).
 */
const NUMERO_INTERIOR = /^-?\d{1,3}\s*[ºª°o]?\s*[a-z]?$/

function normalizarToken(t: string): string {
  return quitarAcentos(t).toLowerCase().replace(/^[.:;,·]+|[.:;,·]+$/g, '')
}

function esTokenInterior(t: string): boolean {
  const n = normalizarToken(t)
  if (n === '') return true
  return (
    CLAVE_INTERIOR.test(n) ||
    PLANTA_INTERIOR.test(n) ||
    ORIENTACION_INTERIOR.test(n) ||
    NUMERO_INTERIOR.test(n) ||
    /^[a-z]$/.test(n)
  )
}

/**
 * Dónde acaba el número de portal, que es la frontera entre «nombre de la vía»
 * (intocable) y «interior» (lo que se puede quitar).
 *
 * Se coge el primer número que se comporta como portal: el que cierra la
 * dirección, el que lleva una coma detrás o el que va seguido de algo que ya es
 * interior. Los que no —«Calle 28 de Febrero 5»— se saltan, y si ninguno
 * cumple se usa el último número, que es el candidato menos malo. Sin números
 * no hay portal y no se toca nada.
 */
function finDelPortal(v: string): number | null {
  const numeros = /\d+/g
  const posibles: number[] = []
  let m: RegExpExecArray | null
  while ((m = numeros.exec(v)) !== null) {
    let fin = m.index + m[0].length
    // «12B»: la letra pegada al número (el bis) va con el portal, no es puerta.
    if (/^[A-Za-z](?![A-Za-z])/.test(v.slice(fin))) fin += 1
    const resto = v.slice(fin)
    // «3º» no es un portal: es una planta.
    if (/^\s*[ºª°]/.test(resto)) continue
    posibles.push(fin)
    if (/^\s*$/.test(resto) || /^\s*[,;]/.test(resto)) return fin
    const siguiente = resto.match(/^\s+([^\s,;]+)/)
    if (siguiente && esTokenInterior(siguiente[1])) return fin
  }
  return posibles.length > 0 ? posibles[posibles.length - 1] : null
}

/**
 * Quita `3º B`, `Esc 2`, `Pl:02 Pt:14`, `bajo dcha`, `portal 2`… — pero SOLO
 * detrás del número de portal, y dejando lo que no es interior (el código
 * postal y la localidad se quedan: son dirección).
 */
function quitarInterior(v: string): string {
  const corte = finDelPortal(v)
  if (corte === null) return limpiarBordes(v)
  return limpiarBordes(v.slice(0, corte) + limpiarCola(v.slice(corte)))
}

function limpiarCola(cola: string): string {
  const grupos = cola.split(/[,;]/)
  const vivos: Array<{ i: number; texto: string }> = []
  grupos.forEach((g, i) => {
    const texto = g
      .split(/\s+/)
      .filter((t) => t !== '' && !esTokenInterior(t))
      .join(' ')
    if (texto !== '') vivos.push({ i, texto })
  })
  if (vivos.length === 0) return ''
  // Si el primer trozo que sobrevive venía pegado al número (sin coma), se
  // vuelve a pegar igual; el resto se separa con coma, como se escribió.
  const primero = vivos[0].i === 0 ? ` ${vivos[0].texto}` : `, ${vivos[0].texto}`
  return primero + vivos.slice(1).map((x) => `, ${x.texto}`).join('')
}

/** Espacios de más y la puntuación que queda colgando al quitar el interior. */
function limpiarBordes(v: string): string {
  return v.replace(/\s+/g, ' ').replace(/[\s,;.\-]+$/, '').trim()
}
