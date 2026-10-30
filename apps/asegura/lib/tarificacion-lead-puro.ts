// F3a — «Listo para tarificar» de un lead, PRIMERO con los BOTS (gratis) (19/10/2026, spec lead → propuesta §F3 y §3.3;
// decisión de Alberto: los bots RPA van antes que Avant2 para no gastar 0,50€). PURO: sin BD, sin red, sin env (salvo el que
// se le pasa). La parte con BD es `tarificacion-lead.ts`; el puerto, `POST /api/operador/correo/tarificar-lead`.
//
// Qué decide esto:
//   · del contrato del lead (`info_riesgo.datosContrato`, ya descifrado por quien llama) + el bloque del riesgo
//     (`datosVehiculo`) → el `FormularioAuto` que encola el bot. Solo lo que el cliente DIJO o el riesgo ya tiene; lo que se
//     supone se DICE (supuestos a la vista en Telegram), y lo que el cliente escribió pero no se lee con certeza (seguro
//     anterior dudoso, moto que no casa con el catálogo, conductor que es otra persona sin sus datos…) va a REPREGUNTA
//     CONCRETA (F3b, códigos de `PREGUNTAS_CONCRETAS`). `noLeidos` queda para los fallos NUESTROS (cifrado, catálogo caído).
//   · solo cuentan los bots que LLEGAN A PRECIO (`llegaAPrecio`, F3b); los demás salen «en pruebas» y no gastan cupo.
//   · qué le falta a CADA bot (`faltanParaTarificar`, fuente única de module-tarificacion) → claves del CONTRATO para la
//     repregunta (F2). Un bot sin declaración (`null`) no es «no falta nada»: no se lanza.
//   · el tope diario (env `ASEGURA_TARIF_AUTO_TOPE_DIARIO`: inválido → 20, máximo duro 100) por día de Madrid.
// 🚨 TARIFICAR ≠ EMITIR. 🚨 Nada de valores en lo que sale de aquí hacia Telegram: claves, etiquetas y nombres de compañía.
import { CARNETS_MOTO_PRECIO, contratoDatos, estimarMesMatriculacion, etiquetasDe, type CodigoConcreto } from '@central/module-seguros'
import { duermeEnGaraje, GARAJES_CONOCIDOS } from '@central/module-seguros/garajes'
import { CAPACIDAD_ALLIANZ_COMUNIDADES, MAX_COMPANIA_ANTERIOR, faltanParaTarificar, llegaAPrecio, obligatoriosPara, type Faltante } from '@central/module-tarificacion'
import { RAMOS_TARIFICABLES_RPA, validarEntradaRamo } from './tarificador-reglas.ts'
import { ultimosCincoDigitosPoliza } from './tarificador-compania-actual.ts'

// ─── Tope diario ─────────────────────────────────────────────────────────────

export const TOPE_DIARIO_DEFECTO = 20
export const TOPE_DIARIO_MAXIMO = 100
/** Lo que suma cada «➕ 10 más hoy» (`clp_top`). */
export const AMPLIACION_TOPE = 10
export const ENV_TOPE_DIARIO = 'ASEGURA_TARIF_AUTO_TOPE_DIARIO'

/** Tope diario de trabajos de bot desde leads. Vacío o inválido → 20; nunca más de 100. PURA. */
export function topeDiario(env: Record<string, string | undefined>): number {
  const t = (env[ENV_TOPE_DIARIO] ?? '').trim()
  if (!/^\d{1,4}$/.test(t)) return TOPE_DIARIO_DEFECTO
  const n = Number(t)
  if (n < 1) return TOPE_DIARIO_DEFECTO
  return Math.min(n, TOPE_DIARIO_MAXIMO)
}

/** Día de Madrid `aaaa-mm-dd` (la fila del contador). PURA (el reloj se inyecta). */
export function diaMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(ahora)
}

/** `aaaammdd` (lo que viaja en `clp_top:<aaaammdd>`) → `aaaa-mm-dd`, o `null` si no es una fecha real. PURA. */
export function diaDeCompacto(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{4})(\d{2})(\d{2})$/.exec(v.trim()) : null
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

/** ¿Caben `n` trabajos más hoy? El tope efectivo nunca pasa de 100 aunque se amplíe. PURA. */
export function caben(usadas: number, tope: number, extra: number, n: number): boolean {
  const efectivo = Math.min(tope + Math.max(0, extra), TOPE_DIARIO_MAXIMO)
  return n > 0 && usadas + n <= efectivo
}

// ─── Del contrato del lead al formulario del bot ─────────────────────────────

/** Ramos de los bots que se pueden armar desde el contrato de un lead (comunidades desde F3b, 19/10/2026). */
export const RAMOS_BOT_DESDE_LEAD = ['auto', 'moto', 'comunidades'] as const
export type RamoBotLead = (typeof RAMOS_BOT_DESDE_LEAD)[number]
export const esRamoBotLead = (r: string): r is RamoBotLead => (RAMOS_BOT_DESDE_LEAD as readonly string[]).includes(r)

/** ¿Hay bot para este ramo en el código? Fuente: `RAMOS_TARIFICABLES_RPA` (la BD decide luego qué compañías). PURA. */
export function ramoConBot(ramo: string): boolean {
  return (RAMOS_TARIFICABLES_RPA as readonly string[]).includes(ramo)
}

export type Supuesto = { campo: string; texto: string }

/**
 * Primera matriculación para el riesgo del bot (30/10/2026). La fecha REAL (ISO, no futura) manda SIEMPRE y va a `fecha`.
 * Si falta y la matrícula es estimable por la serie nacional, el mes estimado va a `estimada` (campo APARTE que ya lee
 * Generali; jamás se pinta como la real) y `supuesto` lo dice en la vista previa. No estimable → ambas ausentes (falta).
 * No se guarda en BD: se calcula al leer. PURA.
 */
export function matriculacionParaRiesgo(
  real: string, matricula: string, hoy: string,
): { fecha?: string; estimada?: string; supuesto?: Supuesto } {
  if (ISO.test(real) && real <= hoy) return { fecha: real }
  const est = estimarMesMatriculacion(matricula, hoy)
  if (est.mesAnio === null || est.mesAnio > hoy) return {}
  return { estimada: est.mesAnio, supuesto: { campo: 'fechaMatriculacion', texto: 'fecha de matriculación estimada por la matrícula (mes aproximado, no es el dato real)' } }
}

/**
 * Marca/modelo/cilindrada de la moto leídos del texto libre del cliente contra el catálogo de motos (GET gratis de
 * Codeoscopic, los mismos nombres que elige la pantalla de moto para los bots). `ok` = un único candidato en cada paso;
 * `duda` = el cliente lo dijo pero no casa con certeza (→ repregunta concreta); `no_mirado` = el catálogo no se pudo leer
 * (fallo NUESTRO: no se le repregunta al cliente por él).
 */
export type LecturaMoto =
  | { estado: 'ok'; marca: string; modelo: string; cilindradaCc: number }
  | { estado: 'duda'; falta: ('marca' | 'modelo' | 'cilindrada')[] }
  | { estado: 'no_mirado' }

export type EntradaFormulario = {
  ramo: RamoBotLead
  /** `datosContrato.valores` ya DESCIFRADOS; lo que no se pudo abrir NO viene (y su clave va en `ilegibles`). */
  valores: Readonly<Record<string, unknown>>
  ilegibles?: readonly string[]
  /** `info_riesgo.datosVehiculo` (o `null`). */
  bloque: Readonly<Record<string, unknown>> | null
  /** De la FICHA: fecha de nacimiento descifrada (ISO) o `null`. */
  fichaNacimiento: string | null
  /**
   * De la FICHA: fecha del carné del conductor (B en coche; de moto, si consta, en moto), ISO, o `null`/ausente = no se sabe.
   * Lo dicho en el correo manda; esto cubre lo que el cliente no repite (igual que `fichaNacimiento`).
   */
  fichaCarne?: string | null
  /**
   * De la FICHA: `clientes.codigo_postal` (columna en claro). Cubre el CP de circulación cuando el cliente no lo dijo ni consta
   * en el bloque del riesgo; solo con 5 dígitos. `null`/ausente = no se sabe (nunca relleno).
   */
  fichaCodigoPostal?: string | null
  /**
   * De la PÓLIZA de auto/moto VIVA vinculada a la oportunidad (`info_riesgo.polizaId`): su compañía y desde cuándo está asegurado
   * en ella (`fecha_efecto_inicial` o, si no, `fecha_inicio`, ISO). Es la «compañía anterior» de una tarificación nueva. `null`/ausente
   * = no hay póliza viva vinculada o no se pudo leer (nunca relleno). `numero` (30/10/2026, «SINCO al tarificar»): su nº de póliza;
   * al riesgo solo viajan sus 5 últimas cifras (`polizaAnteriorUltimos5`). Dato del cliente: nunca en supuestos, Telegram ni logs.
   */
  polizaActual?: { aseguradora: string | null; desde: string | null; numero?: string | null } | null
  /** `aaaa-mm-dd` de hoy (Madrid). */
  hoy: string
  /** Moto: la lectura del catálogo (`null` = el cliente no dio marca/modelo). */
  moto?: LecturaMoto | null
  /** Comunidades: lo que dio el Catastro con la referencia del cliente (`null` = no se consultó o no dio nada). */
  catastro?: { anioConstruccion: number | null; codigoPostal: string | null } | null
}

export type FormularioLead = {
  riesgo: Record<string, unknown>
  /** Lo que se SUPONE (se enseña en Telegram antes del botón). Sin valores personales. */
  supuestos: Supuesto[]
  /** Claves del contrato que el cliente contestó pero no se traducen por un fallo NUESTRO (catálogo caído, cifrado). */
  noLeidos: string[]
  /** El bot solo tarifica al propio cliente como conductor y propietario: si no es así, no se lanza. */
  bloqueos: string[]
  /** Claves del contrato que hay que REPREGUNTAR (el cliente contestó, pero hay duda): bloquean a todos los bots. */
  repreguntar: string[]
  /** La pregunta concreta de cada duda (códigos de `@central/module-seguros` → `PREGUNTAS_CONCRETAS`). */
  concretas: CodigoConcreto[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const txt = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const hay = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')
/** Minúsculas, sin tildes, todo lo que no es letra o número → un espacio. */
const tokens = (s: string) => ` ${sinTildes(s).replace(/[^a-z0-9ñ]+/g, ' ').replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2').trim()} `

/** Nombre de compañía de la póliza → el que espera el bot: el canónico si se reconoce (misma lista que el texto libre); si no, el texto tal cual. `null` = vacío o demasiado largo. PURA. */
export function companiaCanonica(nombre: unknown): string | null {
  const n = txt(nombre)
  if (!n || n.length > MAX_COMPANIA_ANTERIOR) return null
  const t = tokens(n)
  const cias = COMPANIAS_TEXTO.filter(([re]) => re.test(t)).map(([, c]) => c)
  return cias.length === 1 ? cias[0] : n
}

/** Años COMPLETOS entre `desde` (ISO) y `hoy` (ISO). `null` si alguna fecha no es válida o `desde` es futura. PURA. */
export function aniosCompletos(desde: unknown, hoy: string): number | null {
  const d = txt(desde)
  if (!ISO.test(d) || !ISO.test(hoy) || d > hoy) return null
  let a = Number(hoy.slice(0, 4)) - Number(d.slice(0, 4))
  if (hoy.slice(5) < d.slice(5)) a -= 1
  return a
}

/** «dónde duerme» en palabras del cliente → garaje del bot. `null` = no se entiende (no se traduce a ojo). PURA. */
export function garajeDeTexto(v: unknown): { garajeNoche: boolean; tipoGaraje: 'calle' | 'colectivo' | 'individual' | null } | null {
  const s = sinTildes(txt(v))
  if (!s) return null
  const calle = /\b(calle|via publica|en la via|aparcad[oa] fuera|a la intemperie)\b/.test(s)
  const colectivo = /\b(comunitari[oa]|colectiv[oa]|de la comunidad|del edificio|parking publico)\b/.test(s)
  const individual = /\b(individual|propi[oa]|particular|cerrad[oa]|box|cochera)\b/.test(s)
  const garaje = /\bgaraje\b/.test(s)
  if (calle && !garaje && !colectivo && !individual) return { garajeNoche: false, tipoGaraje: 'calle' }
  if (calle) return null // «calle o garaje»: dos respuestas, no se elige
  if (colectivo && !individual) return { garajeNoche: true, tipoGaraje: 'colectivo' }
  if (individual && !colectivo) return { garajeNoche: true, tipoGaraje: 'individual' }
  if (garaje && !colectivo && !individual) return { garajeNoche: true, tipoGaraje: null }
  return null
}

/** Compañías por las que se reconoce el nombre en el texto del seguro anterior (solo nombres, ninguno ambiguo). */
const COMPANIAS_TEXTO: readonly [RegExp, string][] = [
  [/\bmapfre\b/, 'Mapfre'], [/\ballianz\b/, 'Allianz'], [/\bgenerali\b/, 'Generali'], [/\baxa\b/, 'AXA'],
  [/\bmutua madrilena\b/, 'Mutua Madrileña'], [/\blinea directa\b/, 'Línea Directa'], [/\breale\b/, 'Reale'],
  [/\bzurich\b/, 'Zurich'], [/\bliberty\b/, 'Liberty'], [/\boccident\b|\bcatalana occidente\b/, 'Occident'],
  [/\bsanta ?lucia\b/, 'Santalucía'], [/\bpelayo\b/, 'Pelayo'], [/\bverti\b/, 'Verti'], [/\bqualitas\b/, 'Qualitas'],
  [/\bgenesis\b/, 'Génesis'], [/\bfenix directo\b/, 'Fénix Directo'], [/\bhelvetia\b/, 'Helvetia'], [/\bcaser\b/, 'Caser'],
  [/\bplus ultra\b/, 'Plus Ultra'], [/\bregal\b/, 'Regal'], [/\bbalumba\b/, 'Balumba'], [/\bdirect seguros\b/, 'Direct Seguros'],
]

const NUM_PALABRA: Readonly<Record<string, number>> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11,
  doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
}
const NUM = `(\\d{1,2}|${Object.keys(NUM_PALABRA).join('|')})`
const aNumero = (t: string) => (/^\d+$/.test(t) ? Number(t) : NUM_PALABRA[t] ?? NaN)

export type DudaHistorial = 'compania' | 'anios' | 'siniestros'
export type LecturaHistorial = {
  aniosAsegurado: number | null
  siniestros5: number | null
  compania: string | null
  sinSeguro: boolean
  /** Lo que el cliente escribió de su seguro anterior pero no se lee con certeza: va a repregunta CONCRETA, nunca a un supuesto. */
  dudas: DudaHistorial[]
}

/** Frases que dicen CERO partes, incluidas las que contienen «un parte» («ni un parte», «sin un solo parte»). */
const CERO_PARTES = new RegExp(
  [
    `\\bsin (dar |haber dado |tener )?(ningun |ni un |un solo |ni un solo )?(partes?|siniestros?)\\b`,
    `\\bningun (solo )?(parte|siniestro)\\b`,
    `\\bni un (solo )?(parte|siniestro)\\b`,
    `\\b(0|cero) (partes|siniestros)\\b`,
    `\\b(nunca|jamas) (he dado|he tenido|di|tuve) (ningun |ni un |un )?(solo )?(partes?|siniestros?)\\b`,
    `\\bno (he dado|he tenido|tengo|di|tuve) (nunca |ningun |ni un |ni un solo |un solo )?(partes?|siniestros?)\\b`,
    `\\bsiniestralidad (cero|0|nula)\\b`,
  ].join('|'),
  'g',
)

/**
 * El texto libre del «seguro anterior» → lo que piden los bots. TOLERANTE con la forma («diez años», «desde 2016», «llevo 8
 * años sin partes») pero sin adivinar: lo que el cliente escribió y no se lee con certeza va en `dudas` (repregunta
 * concreta), nunca a un número supuesto. Ante la duda entre 0 y ≥1 partes, `siniestros` es duda. PURA.
 */
export function historialDeTexto(v: unknown, hoy?: string): LecturaHistorial {
  const s = sinTildes(txt(v)).replace(/[.,;:!¡¿?()]/g, ' ').replace(/\s+/g, ' ').trim()
  const vacio: LecturaHistorial = { aniosAsegurado: null, siniestros5: null, compania: null, sinSeguro: false, dudas: [] }
  if (!s) return vacio
  if (/\b(no tengo seguro|sin seguro|no tiene seguro|primer seguro|nunca he tenido seguro|nunca he estado asegurad[oa]|es mi primer (coche|vehiculo|moto))\b/.test(s)) {
    // Sin seguro previo no hay partes como asegurado: 0 años y 0 partes (se dice como supuesto en Telegram).
    return { ...vacio, aniosAsegurado: 0, siniestros5: 0, sinSeguro: true }
  }
  const dudas = new Set<DudaHistorial>()

  // ── Partes: primero lo que dice CERO (y se quita del texto), luego lo que dice algún parte. ──
  const ceroMatches = s.match(CERO_PARTES) ?? []
  const sinCero = s.replace(CERO_PARTES, ' ')
  // «N años sin partes»: si N ≥ 5, cero partes en los últimos 5 años; con N < 5, lo de antes no se sabe.
  const aniosSinPartes = [...s.matchAll(new RegExp(`${NUM} anos? sin (dar )?(ningun )?(partes?|siniestros?)`, 'g'))].map((m) => aNumero(m[1]))
  const positivos = [...sinCero.matchAll(new RegExp(`${NUM} (partes?|siniestros?)\\b`, 'g'))].map((m) => aNumero(m[1]))
  const dicePartes = /\b(partes?|siniestros?)\b/.test(sinCero) && !/\banos? sin\b/.test(sinCero)
  let siniestros5: number | null = null
  if (positivos.length) {
    // Algún parte: solo vale el número si es UNO y el cliente lo sitúa en los últimos 5 años.
    const distintos = [...new Set(positivos)]
    if (distintos.length === 1 && !ceroMatches.length && /\bultimos (5|cinco) anos\b/.test(s)) siniestros5 = distintos[0]
    else dudas.add('siniestros')
  } else if (aniosSinPartes.length) {
    const minimo = Math.min(...aniosSinPartes)
    if (minimo >= 5) siniestros5 = 0
    else dudas.add('siniestros')
  } else if (ceroMatches.length && !dicePartes) siniestros5 = 0
  else dudas.add('siniestros')

  // ── Años asegurado ──
  const sinTramosSinPartes = s.replace(new RegExp(`${NUM} anos? sin (dar )?(ningun )?(partes?|siniestros?)`, 'g'), ' ')
  const candidatos = new Set<number>()
  for (const m of sinTramosSinPartes.matchAll(new RegExp(`(llevo|desde hace|durante) ${NUM} anos?`, 'g'))) candidatos.add(aNumero(m[2]))
  for (const m of sinTramosSinPartes.matchAll(new RegExp(`${NUM} anos? (asegurad|con (ell|la |esa |el |mi |ellos)|de seguro|en (la compania|ell)|seguid|cotizad)`, 'g'))) candidatos.add(aNumero(m[1]))
  for (const m of sinTramosSinPartes.matchAll(new RegExp(`(asegurad[oa]s?|con ell[oa]s|en la compania) (desde hace |durante )?${NUM} anos?`, 'g'))) candidatos.add(aNumero(m[3]))
  // Todos los «N años» del texto (salvo los de «N años sin partes»): si hay más de un número, no se elige cuál es.
  const todos = new Set([...sinTramosSinPartes.matchAll(new RegExp(`${NUM} anos?`, 'g'))].map((m) => aNumero(m[1])))
  const anioDesde = /\bdesde (el )?(ano )?((19|20)\d{2})\b/.exec(s)
  if (anioDesde && hoy && ISO.test(hoy)) {
    const n = Number(hoy.slice(0, 4)) - Number(anioDesde[3])
    if (n >= 0 && n <= 70) { candidatos.add(n); todos.add(n) }
  }
  const validos = [...candidatos].filter((n) => Number.isInteger(n) && n >= 0 && n <= 70)
  const aniosAsegurado = validos.length === 1 && todos.size === 1 ? validos[0] : null
  if (aniosAsegurado === null) dudas.add('anios')

  // ── Compañía ──
  const cias = COMPANIAS_TEXTO.filter(([re]) => re.test(s)).map(([, n]) => n)
  const compania = cias.length === 1 ? cias[0] : null
  if (cias.length !== 1) dudas.add('compania')

  return { aniosAsegurado, siniestros5, compania, sinSeguro: false, dudas: [...dudas] }
}

/** «yo», «yo mismo», «el mismo», «soy yo», «el tomador»… = el propio cliente. PURA. */
export function esElPropioCliente(v: unknown): boolean {
  const s = sinTildes(txt(v)).replace(/[.,;:!¡¿?()"«»]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return false
  return /^(yo|yo mism[oa]|soy yo|el mismo|la misma|lo mismo|mism[oa]|el tomador|la tomadora|el titular|yo soy (el|la) (conductor[a]?|titular)|solo yo|nadie mas|ninguno|ninguna|nadie|no|es el mismo|es la misma|soy el mismo|soy la misma|el mismo que el tomador|yo lo conduzco|lo conduzco yo|la conduzco yo|yo la conduzco)$/.test(s)
}

const RE_DOCUMENTO = /\b(\d{8}\s?-?\s?[a-z]|[xyz]\s?-?\s?\d{7}\s?-?\s?[a-z])\b/i
const RE_FECHA = /\b(\d{1,2}[/.-]\d{1,2}[/.-](19|20)?\d{2}|(19|20)\d{2}-\d{1,2}-\d{1,2}|\d{1,2} de [a-z]+ de (19|20)\d{2})\b/gi

/**
 * ¿El texto sobre otra persona trae ya lo que se le pediría? Documento con forma de DNI/NIE y, si es conductor, dos fechas
 * (nacimiento y carné). Solo PRESENCIA: los datos de terceros no se leen ni se validan aquí (van cifrados y los mira Alberto). PURA.
 */
export function pareceDatosPersona(v: unknown, conCarne: boolean): boolean {
  const s = txt(v)
  if (!RE_DOCUMENTO.test(s)) return false
  return !conCarne || (s.match(RE_FECHA) ?? []).length >= 2
}

// ─── Moto: marca/modelo/cilindrada del texto libre contra el catálogo ────────

export type OpcionCatalogo = { id: string; nombre: string }
export type EleccionCatalogo = { estado: 'uno'; opcion: OpcionCatalogo } | { estado: 'varios' } | { estado: 'ninguno' }

/**
 * Las opciones del catálogo cuyo nombre aparece ENTERO (palabras completas) en el texto. Si casan varias y una contiene a
 * todas las demás («PCX» y «PCX 125»), gana la más larga; si no, `varios` (no se elige). PURA.
 */
export function opcionEnTexto(texto: string, opciones: readonly OpcionCatalogo[]): EleccionCatalogo {
  const t = tokens(texto)
  const casan = opciones.filter((o) => { const n = tokens(o.nombre); return n.trim() !== '' && t.includes(n) })
  const porNombre = new Map(casan.map((o) => [tokens(o.nombre), o]))
  if (porNombre.size === 0) return { estado: 'ninguno' }
  const nombres = [...porNombre.keys()].sort((a, b) => b.length - a.length)
  if (nombres.length > 1 && !nombres.slice(1).every((n) => nombres[0].includes(n))) return { estado: 'varios' }
  // Dos opciones con el mismo nombre (ids distintos) tampoco se eligen.
  if (casan.filter((o) => tokens(o.nombre) === nombres[0]).length > 1) return { estado: 'varios' }
  return { estado: 'uno', opcion: porNombre.get(nombres[0])! }
}

/**
 * Cilindrada en cc: «125 cc», «125cc», «125 c.c.» o, si no, UN único número de 50 a 3000 que no forme parte del nombre de
 * la marca ni del modelo elegidos. Varios números distintos o ninguno → `null` (se pregunta). PURA.
 */
export function cilindradaEnTexto(texto: string, nombresUsados: readonly string[]): number | null {
  const s = sinTildes(texto)
  const explicita = [...s.matchAll(/(\d{2,4})\s*(cc|c\.c\.?|cm3|cm³|centimetros cubicos)\b/g)].map((m) => Number(m[1]))
  const exp = [...new Set(explicita)]
  if (exp.length > 1) return null
  let resto = tokens(texto)
  for (const n of nombresUsados) resto = resto.replace(tokens(n), ' ')
  const nums = [...new Set([...resto.matchAll(/ (?=(\d{2,4}) )/g)].map((m) => Number(m[1])).filter((n) => n >= 50 && n <= 3000))]
  // «125 o 150 cc»: otro número suelto distinto del explícito también es duda.
  if (exp.length === 1) return exp[0] >= 1 && exp[0] <= 3000 && nums.every((n) => n === exp[0]) ? exp[0] : null
  return nums.length === 1 ? nums[0] : null
}

/** Clase de Allianz Moto por cilindrada (tramos de `formulario-auto.ts`). `null` = ≤50 cc (ciclomotor) o sin dato. PURA. */
export function claseMoto(cc: number | null): 1 | 2 | 3 | 4 | null {
  if (cc === null || cc <= 50) return null
  return cc <= 125 ? 1 : cc <= 350 ? 2 : cc <= 750 ? 3 : 4
}

/**
 * Texto libre de la moto → `LecturaMoto`, con los catálogos INYECTADOS (marcas y, una vez elegida la marca, sus modelos). Un
 * catálogo que lanza = `no_mirado` (fallo nuestro, no del cliente). Pura salvo lo que hagan los cargadores.
 */
export async function lecturaMoto(texto: string, cargar: { marcas: () => Promise<readonly OpcionCatalogo[]>; modelos: (marcaId: string) => Promise<readonly OpcionCatalogo[]> }): Promise<LecturaMoto> {
  let marcas: readonly OpcionCatalogo[]
  try { marcas = await cargar.marcas() } catch { return { estado: 'no_mirado' } }
  if (!marcas.length) return { estado: 'no_mirado' }
  const marca = opcionEnTexto(texto, marcas)
  if (marca.estado !== 'uno') return { estado: 'duda', falta: ['marca', 'modelo', 'cilindrada'] }
  let modelos: readonly OpcionCatalogo[]
  try { modelos = await cargar.modelos(marca.opcion.id) } catch { return { estado: 'no_mirado' } }
  const modelo = opcionEnTexto(texto.replace(new RegExp(marca.opcion.nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' '), modelos)
  const cc = cilindradaEnTexto(texto, [marca.opcion.nombre, ...(modelo.estado === 'uno' ? [modelo.opcion.nombre] : [])])
  if (modelo.estado !== 'uno') return { estado: 'duda', falta: cc === null ? ['modelo', 'cilindrada'] : ['modelo'] }
  if (cc === null) return { estado: 'duda', falta: ['cilindrada'] }
  return { estado: 'ok', marca: marca.opcion.nombre, modelo: modelo.opcion.nombre, cilindradaCc: cc }
}

// ─── Comunidades ─────────────────────────────────────────────────────────────

/** «20 viviendas y 2 locales» / «22» / «20 pisos, sin locales» → total. `null` = no se lee con certeza (se pregunta). PURA. */
export function viviendasYLocalesDeTexto(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 5000 ? v : null
  const s = sinTildes(txt(v))
  if (!s) return null
  if (/^\d{1,4}$/.test(s)) { const n = Number(s); return n >= 1 ? n : null }
  const viv = [...s.matchAll(/(\d{1,4}) (viviendas?|pisos?|vecinos?|propietarios?)\b/g)].map((m) => Number(m[1]))
  const loc = [...s.matchAll(/(\d{1,4}) (locales?|bajos? comerciales?)\b/g)].map((m) => Number(m[1]))
  const sinLocales = /\b(sin|ningun|no hay|cero|0) locale?s?\b|\bningun local\b/.test(s)
  if (viv.length !== 1 || loc.length > 1) return null
  if (loc.length === 1) return viv[0] + loc[0]
  return sinLocales ? viv[0] : null
}

const unAnioDespues = (iso: string): string | null => {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a + 1, m - 1, d))
  if (f.getUTCMonth() !== m - 1) return null // 29 de febrero: no se supone el día
  return f.toISOString().slice(0, 10)
}

/** Contrato del lead (comunidades) → `RiesgoComunidad` candidato. Desplegables del portal: los de defecto, DICHOS. PURA. */
function formularioComunidad(e: EntradaFormulario): FormularioLead {
  const v = e.valores
  const supuestos: Supuesto[] = []
  const repreguntar = new Set<string>()
  const concretas = new Set<CodigoConcreto>()
  const entero = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null)
  const riesgo: Record<string, unknown> = { ramo: 'comunidades' }
  let cp = txt(v['direccion.codigoPostal'])
  if (!cp && e.catastro?.codigoPostal) { cp = e.catastro.codigoPostal; supuestos.push({ campo: 'direccion.codigoPostal', texto: 'código postal del edificio: el del Catastro (por su referencia)' }) }
  riesgo.direccion = cp ? { codigoPostal: cp } : {}
  const efecto = txt(v.fechaEfecto)
  if (ISO.test(efecto) && efecto > e.hoy) {
    riesgo.fechaEfecto = efecto
    const termino = unAnioDespues(efecto)
    if (termino) { riesgo.fechaTermino = termino; supuestos.push({ campo: 'fechaTermino', texto: 'fecha de término: un año después del efecto' }) }
  }
  const m2 = entero(v.m2Construidos)
  if (m2 !== null) riesgo.m2Construidos = m2
  let anio = entero(v.anioConstruccion)
  if (anio === null && e.catastro?.anioConstruccion) { anio = e.catastro.anioConstruccion; supuestos.push({ campo: 'anioConstruccion', texto: 'año de construcción: el del Catastro (por su referencia)' }) }
  if (anio !== null) riesgo.anioConstruccion = anio
  const plantas = entero(v.plantas)
  if (plantas !== null) riesgo.plantas = plantas
  const edificios = entero(v.numEdificios)
  if (edificios !== null) riesgo.numEdificios = edificios
  if (hay(v.numViviendasYLocales)) {
    const n = viviendasYLocalesDeTexto(v.numViviendasYLocales)
    if (n !== null) riesgo.numViviendasYLocales = n
    else { repreguntar.add('numViviendasYLocales'); concretas.add('comunidad_viviendas') }
  }
  if (typeof v.capitalContinente === 'number' && v.capitalContinente > 0) riesgo.capitalContinente = v.capitalContinente
  if (/^[0-9A-Z]{14}([0-9A-Z]{4}[A-Z]{2})?$/.test(txt(v.referenciaCatastral).replace(/[\s-]/g, '').toUpperCase())) {
    riesgo.referenciaCatastral = txt(v.referenciaCatastral).replace(/[\s-]/g, '').toUpperCase()
  }
  // Desplegables de ePAC que no son dato del cliente: el valor por defecto de la capacidad, a la vista.
  for (const x of CAPACIDAD_ALLIANZ_COMUNIDADES.extras) {
    if (x.obligatorio && typeof x.porDefecto === 'string') riesgo[x.clave] = x.porDefecto
  }
  supuestos.push({ campo: 'desplegables', texto: 'tipo de vivienda, uso y lista de propietarios del portal: los de por defecto' })
  return { riesgo, supuestos, noLeidos: [...(e.ilegibles ?? [])], bloqueos: [], repreguntar: [...repreguntar], concretas: [...concretas] }
}

/**
 * Contrato del lead + bloque del riesgo → formulario candidato del bot (auto/moto: `FormularioAuto`; comunidades:
 * `RiesgoComunidad`). Nada personal se inventa: lo que falta no se pone (lo dirá `faltanParaTarificar`). Lo supuesto va en
 * `supuestos`; lo que el cliente dijo pero no se entiende con certeza, en `repreguntar` + `concretas`. PURA.
 */
export function formularioBotDesdeLead(e: EntradaFormulario): FormularioLead {
  if (e.ramo === 'comunidades') return formularioComunidad(e)
  const v = e.valores
  const b = e.bloque ?? {}
  const supuestos: Supuesto[] = []
  const noLeidos = new Set<string>(e.ilegibles ?? [])
  const bloqueos: string[] = []
  const repreguntar = new Set<string>()
  const concretas = new Set<CodigoConcreto>()
  const riesgo: Record<string, unknown> = { ramo: e.ramo }

  const matricula = txt(v.matricula) || txt(b.matricula)
  if (matricula) riesgo.matricula = matricula
  const cp = txt(v.cpCirculacion) || txt(b.cpCirculacion)
  const cpFicha = txt(e.fichaCodigoPostal)
  if (cp) riesgo.codigoPostal = cp
  else if (/^\d{5}$/.test(cpFicha)) {
    riesgo.codigoPostal = cpFicha
    supuestos.push({ campo: 'cpCirculacion', texto: 'código postal de circulación: el de la ficha del cliente (se supone que el vehículo circula donde vive)' })
  }

  const conductor: Record<string, unknown> = {}
  const nac = txt(v.fechaNacimiento) || (e.fichaNacimiento && ISO.test(e.fichaNacimiento) ? e.fichaNacimiento : '')
  if (ISO.test(nac)) conductor.fechaNacimiento = nac
  const carne = txt(v.fechaCarnet) || (e.fichaCarne && ISO.test(e.fichaCarne) ? e.fichaCarne : '')
  if (ISO.test(carne)) conductor.fechaCarne = carne
  conductor.sexo = v.sexo === 'H' ? 'hombre' : v.sexo === 'M' ? 'mujer' : null
  riesgo.conductor = conductor

  // Conductor y titular (F3b): «yo» / «el mismo» = el propio cliente. Otra persona: el bot no la tarifica (bloqueo) y, si
  // aún no ha dado sus datos, se le piden en la repregunta.
  if (!hay(v.conductor)) {
    riesgo.tomadorEsConductor = true
    supuestos.push({ campo: 'conductor', texto: 'conductor habitual: el propio cliente (no ha dicho otro)' })
  } else if (esElPropioCliente(v.conductor)) {
    riesgo.tomadorEsConductor = true
    supuestos.push({ campo: 'conductor', texto: 'conductor habitual: el propio cliente (lo dice él)' })
  } else {
    bloqueos.push('el conductor habitual es otra persona (el bot solo tarifica al propio cliente)')
    if (!pareceDatosPersona(v.conductor, true)) { repreguntar.add('conductor'); concretas.add('conductor_datos') }
  }
  if (!hay(v.propietario)) {
    riesgo.tomadorEsPropietario = true
    supuestos.push({ campo: 'propietario', texto: 'titular: el propio cliente (no ha dicho otro)' })
  } else if (esElPropioCliente(v.propietario)) {
    riesgo.tomadorEsPropietario = true
    supuestos.push({ campo: 'propietario', texto: 'titular: el propio cliente (lo dice él)' })
  } else {
    bloqueos.push('el titular del vehículo es otra persona (el bot solo tarifica al cliente como titular)')
    if (!pareceDatosPersona(v.propietario, false)) { repreguntar.add('propietario'); concretas.add('propietario_datos') }
  }

  // Garaje: el código del riesgo manda; si no, lo que dijo el cliente (si se entiende sin adivinar; si no, se le pregunta).
  const codigo = txt(b.garaje)
  if (codigo && GARAJES_CONOCIDOS[codigo]) {
    riesgo.garajeNoche = duermeEnGaraje(codigo)
    const clase = GARAJES_CONOCIDOS[codigo].clase
    const tipo = clase === 'calle' ? 'calle' : clase === 'comunitario' ? 'colectivo' : clase === 'individual' ? 'individual' : null
    if (tipo) riesgo.tipoGaraje = tipo
  } else if (hay(v.garaje)) {
    const g = garajeDeTexto(v.garaje)
    if (g) { riesgo.garajeNoche = g.garajeNoche; if (g.tipoGaraje) riesgo.tipoGaraje = g.tipoGaraje }
    else { repreguntar.add('garaje'); concretas.add('garaje') }
  }

  // Seguro anterior (texto libre): lectura tolerante; lo dudoso → repregunta concreta (nunca un supuesto favorable encima).
  if (hay(v.aseguradoAntes)) {
    const h = historialDeTexto(v.aseguradoAntes, e.hoy)
    if (h.aniosAsegurado !== null) riesgo.aniosAseguradoAnterior = h.aniosAsegurado
    if (h.siniestros5 !== null) riesgo.siniestrosUltimos5Anios = h.siniestros5
    if (h.compania) riesgo.companiaAnterior = h.compania
    if (h.sinSeguro) supuestos.push({ campo: 'aseguradoAntes', texto: 'sin seguro anterior: 0 años asegurado y 0 partes' })
    // La compañía solo importa si llevaba años asegurado (si dijo 0, no se pregunta).
    const dudas = h.dudas.filter((d) => d !== 'compania' || h.aniosAsegurado !== 0)
    if (dudas.length) repreguntar.add('aseguradoAntes')
    for (const d of dudas) concretas.add(d === 'compania' ? 'seguro_anterior_compania' : d === 'anios' ? 'seguro_anterior_anios' : 'seguro_anterior_siniestros')
  }

  // Póliza viva vinculada: su compañía es la «compañía anterior» y su antigüedad en ella, un MÍNIMO de años asegurado. Solo si el
  // cliente no declaró su seguro anterior (lo dicho en el correo manda) y solo con ≥ 1 año completo (menos no prueba nada).
  const pa = e.polizaActual
  if (pa && !hay(v.aseguradoAntes)) {
    const cia = companiaCanonica(pa.aseguradora)
    const anios = aniosCompletos(pa.desde, e.hoy)
    if (cia && anios !== null && anios >= 1) {
      riesgo.companiaAnterior = cia
      riesgo.aniosAseguradoAnterior = anios
      supuestos.push({ campo: 'aseguradoAntes', texto: 'compañía anterior y años asegurado (mínimo): los de la póliza de auto vigente del cliente' })
    }
  }
  // Nº de póliza anterior (30/10/2026, «SINCO al tarificar»): con él la compañía consulta SINCO y el precio sale confirmado. Solo si el
  // riesgo no lo trae ya, si la compañía anterior del riesgo ES la de esa póliza (si el cliente dijo otra, ese número no es el suyo) y no
  // se declaró «0 años asegurado». Solo las 5 últimas cifras; el número entero no sale de aquí.
  if (pa && !hay(riesgo.polizaAnteriorUltimos5) && riesgo.aniosAseguradoAnterior !== 0) {
    const cia = companiaCanonica(pa.aseguradora)
    const ultimos5 = ultimosCincoDigitosPoliza(pa.numero)
    if (cia && riesgo.companiaAnterior === cia && ultimos5) riesgo.polizaAnteriorUltimos5 = ultimos5
  }

  const mat = matriculacionParaRiesgo(txt(b.fechaMatriculacion), matricula, e.hoy)
  if (mat.fecha) riesgo.fechaMatriculacion = mat.fecha
  if (mat.estimada && mat.supuesto) { riesgo.fechaMatriculacionEstimada = mat.estimada; supuestos.push(mat.supuesto) }
  const efecto = txt(v.fechaEfecto)
  if (ISO.test(efecto) && efecto > e.hoy) riesgo.fechaVencimiento = efecto

  if (e.ramo === 'auto') {
    riesgo.usoVehiculo = 'particular'
    riesgo.ambitoCirculacion = 'espana'
    riesgo.clasePermiso = 'b'
    supuestos.push({ campo: 'uso', texto: 'uso particular, circulación en España y carné B (los de por defecto del coche)' })
  } else if (hay(v.codigoVehiculo)) {
    // Moto: los portales piden marca, modelo y cilindrada POR SEPARADO, con los nombres del catálogo.
    const m = e.moto ?? { estado: 'no_mirado' as const }
    if (m.estado === 'ok') {
      riesgo.seleccionVehiculo = { marca: m.marca, modelo: m.modelo, clase: claseMoto(m.cilindradaCc), cilindradaCc: m.cilindradaCc }
      supuestos.push({ campo: 'codigoVehiculo', texto: 'marca, modelo y cilindrada de la moto: leídos de su texto contra el catálogo (sin versión)' })
    } else if (m.estado === 'duda') {
      repreguntar.add('codigoVehiculo')
      concretas.add(m.falta.length === 1 && m.falta[0] === 'cilindrada' ? 'moto_cilindrada' : 'moto_vehiculo')
    } else noLeidos.add('codigoVehiculo')
  }
  return { riesgo, supuestos, noLeidos: [...noLeidos], bloqueos, repreguntar: [...repreguntar], concretas: [...concretas] }
}

// ─── Qué falta, en claves del CONTRATO ───────────────────────────────────────

/** Clave de un validador del bot («conductor.fechaCarne») → clave del contrato que la pregunta (`fechaCarnet`). PURA. */
export function claveContratoDeBot(ramo: string, claveBot: string): string | null {
  const raiz = claveBot.split(':')[0].trim()
  for (const f of contratoDatos(ramo).campos) {
    if (f.clave === raiz || (f.cubre ?? []).includes(raiz)) return f.clave
  }
  // Prefijo: «seleccionVehiculo.x» cubierto por «seleccionVehiculo», etc.
  const padre = raiz.split('.')[0]
  for (const f of contratoDatos(ramo).campos) if ((f.cubre ?? []).includes(padre)) return f.clave
  return null
}

export type ValoracionCompania =
  | { compania: string; estado: 'lista' }
  /** `preguntar`: claves del contrato a repreguntar. `noLeidas`: el cliente las dio pero no se traducen. `otros`: etiquetas sin pregunta. */
  | { compania: string; estado: 'faltan'; preguntar: string[]; noLeidas: string[]; otros: string[] }
  /** El bot de esa compañía no declara qué necesita: no se lanza (no es «no falta nada»). */
  | { compania: string; estado: 'sin_declaracion' }
  /** Su bot está EN PRUEBAS (no llega a precio, `llegaAPrecio`): ni se lanza ni gasta cupo desde un lead. */
  | { compania: string; estado: 'en_pruebas' }

/**
 * Para UNA compañía con bot activo: ¿llega a precio con este riesgo? Primero, que su bot llegue a precio de verdad
 * (`llegaAPrecio`); luego lo que falta (`faltanParaTarificar`, sin lo que pone la ficha al encolar) y la FORMA
 * (`validarEntradaRamo`). Cada hueco → clave del contrato. Las dudas del texto del cliente (`repreguntar`) bloquean a
 * todas. PURA.
 */
export function valorarCompania(compania: string, ramo: RamoBotLead, f: FormularioLead): ValoracionCompania {
  if (!llegaAPrecio(compania, ramo)) {
    // Sin declaración sigue diciéndose como tal (no es lo mismo que «en pruebas»).
    return faltanParaTarificar(compania, ramo, f.riesgo, { sinFicha: true }) === null ? { compania, estado: 'sin_declaracion' } : { compania, estado: 'en_pruebas' }
  }
  const faltan: Faltante[] | null = faltanParaTarificar(compania, ramo, f.riesgo, { sinFicha: true })
  if (faltan === null) return { compania, estado: 'sin_declaracion' }
  const huecos: string[] = faltan.map((x) => x.clave)
  const etiquetas = new Map(faltan.map((x) => [x.clave, x.etiqueta]))
  if (!huecos.length) {
    const v = validarEntradaRamo(ramo, f.riesgo, compania)
    if (v.ok && !f.bloqueos.length && !f.repreguntar.length) return { compania, estado: 'lista' }
    if (!v.ok) for (const err of v.errores ?? [v.mensaje]) { const k = err.split(':')[0].trim().split(' ')[0]; huecos.push(k); etiquetas.set(k, k) }
  }
  const noLeidos = new Set(f.noLeidos)
  const dudas = new Set(f.repreguntar)
  const preguntar = new Set<string>(f.repreguntar)
  const noLeidas = new Set<string>()
  const otros = new Set<string>(f.bloqueos)
  for (const h of huecos) {
    const k = claveContratoDeBot(ramo, h)
    if (k === null) otros.add(etiquetas.get(h) ?? h)
    else if (dudas.has(k)) continue
    else if (noLeidos.has(k)) noLeidas.add(k)
    else preguntar.add(k)
  }
  if (!preguntar.size && !noLeidas.size && !otros.size) return { compania, estado: 'lista' }
  return { compania, estado: 'faltan', preguntar: [...preguntar], noLeidas: [...noLeidas], otros: [...otros] }
}

// ─── El cuerpo del puerto ────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type PeticionTarificarLead =
  | {
      accion: 'revisar' | 'tarificar'; clienteId: string; oportunidadIds: string[]; actor: string
      /** F3b: el pendiente `clp` y el mensaje de Telegram del aviso, para avisar EN SU HILO si un bot lanzado falla. */
      pendienteId?: string; tgMessageId?: string
    }
  | { accion: 'ampliar_tope'; dia: string; actor: string }
  /** F3b: Alberto elige entre el dato de la ficha (o el que ya había) y el del correo para una discrepancia. */
  | { accion: 'elegir'; clienteId: string; oportunidadIds: string[]; clave: string; eleccion: 'ficha' | 'correo'; actor: string }
  /** F3b: qué claves del contrato han hecho fallar a los bots lanzados desde el lead (para la repregunta). Solo lee. */
  | { accion: 'fallos'; clienteId: string; oportunidadIds: string[]; actor: string }

const ID_CORTO = /^\d{1,15}$/
const CLAVE_CONTRATO = /^[A-Za-z][A-Za-z0-9.]{0,39}$/

/**
 * `{ accion:'revisar'|'tarificar'|'fallos', clienteId, oportunidadIds[], actor, pendienteId?, tgMessageId? }` ·
 * `{ accion:'ampliar_tope', dia:'aaaammdd', actor }` · `{ accion:'elegir', clienteId, oportunidadIds[1], clave, eleccion }`. PURA.
 */
export function validarPeticionTarificarLead(b: unknown, hoy: string): { ok: true; valor: PeticionTarificarLead } | { ok: false; motivo: string } {
  const o = typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
  const actor = txt(o.actor).slice(0, 120)
  if (!/^[a-z][a-z0-9_.:@-]{2,119}$/i.test(actor)) return { ok: false, motivo: 'actor inválido' }
  if (o.accion === 'ampliar_tope') {
    const dia = diaDeCompacto(o.dia)
    if (!dia) return { ok: false, motivo: 'dia inválido (aaaammdd)' }
    // Solo HOY: un botón de otro día no amplía el de hoy (sería gastar el cupo de un día que ya pasó en otro).
    if (dia !== hoy) return { ok: false, motivo: 'ese botón es de otro día' }
    return { ok: true, valor: { accion: 'ampliar_tope', dia, actor } }
  }
  if (o.accion !== 'revisar' && o.accion !== 'tarificar' && o.accion !== 'elegir' && o.accion !== 'fallos') return { ok: false, motivo: 'accion desconocida' }
  const clienteId = txt(o.clienteId)
  if (!UUID.test(clienteId)) return { ok: false, motivo: 'clienteId inválido' }
  const ids = Array.isArray(o.oportunidadIds) ? [...new Set(o.oportunidadIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)))] : []
  if (!ids.length || ids.length > 5) return { ok: false, motivo: 'oportunidadIds: de 1 a 5 uuid' }
  if (o.accion === 'elegir') {
    if (ids.length !== 1) return { ok: false, motivo: 'elegir: una sola oportunidad' }
    const clave = txt(o.clave)
    if (!CLAVE_CONTRATO.test(clave)) return { ok: false, motivo: 'clave inválida' }
    if (o.eleccion !== 'ficha' && o.eleccion !== 'correo') return { ok: false, motivo: 'eleccion: ficha | correo' }
    return { ok: true, valor: { accion: 'elegir', clienteId, oportunidadIds: ids, clave, eleccion: o.eleccion, actor } }
  }
  if (o.accion === 'fallos') return { ok: true, valor: { accion: 'fallos', clienteId, oportunidadIds: ids, actor } }
  const pendienteId = ID_CORTO.test(String(o.pendienteId ?? '')) ? String(o.pendienteId) : undefined
  const tgMessageId = ID_CORTO.test(String(o.tgMessageId ?? '')) ? String(o.tgMessageId) : undefined
  return { ok: true, valor: { accion: o.accion, clienteId, oportunidadIds: ids, actor, ...(pendienteId ? { pendienteId } : {}), ...(tgMessageId ? { tgMessageId } : {}) } }
}

// ─── F3b: fallo de un bot lanzado desde un lead ──────────────────────────────

export type ClaseFalloBot =
  /** Le falta o no le vale un dato que da el CLIENTE: repregunta F2 (con ✅), nunca reintento. */
  | { tipo: 'dato_cliente'; claves: string[] }
  /** Otro fallo (portal, infra, credenciales, mapa…): solo el aviso. */
  | { tipo: 'otro' }

/**
 * ¿El fallo de un bot es por un dato del cliente? Solo con `tipo: 'datos'` y cuando su mensaje nombra la ETIQUETA de un
 * obligatorio de ese bot (`obligatoriosPara`) que se le pide al cliente (clave del contrato con pregunta). Lo demás es
 * `otro` (un «datos» sin etiqueta reconocible no se adivina). El mensaje no sale de aquí. PURA.
 */
export function clasificarFalloBot(compania: string, ramo: string, error: { tipo?: unknown; mensaje?: unknown } | null): ClaseFalloBot {
  if (!error || error.tipo !== 'datos' || typeof error.mensaje !== 'string') return { tipo: 'otro' }
  const m = sinTildes(error.mensaje)
  const lista = obligatoriosPara(compania, ramo) ?? []
  const pedibles = new Map(contratoDatos(ramo).campos.filter((c) => c.pregunta !== null).map((c) => [c.clave, c]))
  const claves = new Set<string>()
  for (const c of lista) {
    if (c.origen !== 'formulario') continue
    if (!m.includes(sinTildes(c.etiqueta))) continue
    const k = claveContratoDeBot(ramo, c.clave)
    if (k && pedibles.has(k)) claves.add(k)
  }
  return claves.size ? { tipo: 'dato_cliente', claves: [...claves] } : { tipo: 'otro' }
}

/** ¿Este estado del trabajo, tras el resultado del worker, es un fallo que ya no se reintenta solo? PURA. */
export function esFalloTerminal(estadoTrabajo: string): boolean {
  return estadoTrabajo === 'error_definitivo' || estadoTrabajo === 'requiere_humano'
}

/**
 * Los botones del aviso del fallo. 📝 `clp_fal:<p>` si el fallo es un dato del CLIENTE. 💶 `clp_cds:<p>:<ramo>` (opción B,
 * 19/10/2026) SOLO en coche/moto: entrega el lead al asistente de Avant2 de plataforma, que propone el vehículo del catálogo
 * y pide el 0,50€ con OTRO botón (`cas_tarif`); este no paga. Sin pendiente (lead sin aviso) no hay botones. PURA.
 */
export function botonesFalloBotLead(a: { ramo: string; pendienteId: string | null; clase: ClaseFalloBot }): { texto: string; callback: string }[][] {
  if (!a.pendienteId || !/^\d{1,15}$/.test(a.pendienteId)) return []
  const fila: { texto: string; callback: string }[] = []
  if (a.clase.tipo === 'dato_cliente') fila.push({ texto: '📝 Preparar repregunta', callback: `clp_fal:${a.pendienteId}` })
  if (a.ramo === 'auto' || a.ramo === 'moto') fila.push({ texto: '💶 Avant2 (0,50€)', callback: `clp_cds:${a.pendienteId}:${a.ramo}` })
  return fila.length ? [fila] : []
}

/** Aviso del fallo (HTML seguro para Telegram): compañía, ramo y etiquetas; NUNCA el mensaje del portal ni un valor. PURA. */
export function textoFalloBotLead(a: { compania: string; ramo: string; pendienteId: string | null; clase: ClaseFalloBot; tipoError: string | null }): string {
  const cia = a.compania.charAt(0).toUpperCase() + a.compania.slice(1)
  const ramo = a.ramo === 'auto' ? 'coche' : a.ramo
  const ref = a.pendienteId ? ` (#clp${a.pendienteId})` : ''
  if (a.clase.tipo === 'dato_cliente') {
    const etq = etiquetasDe([a.ramo], new Set(a.clase.claves))
    return `❌ <b>El bot de ${cia} (${ramo}) no ha llegado a precio</b>${ref}: el portal no acepta o le falta ${etq.join(', ')}. ` +
      'Es un dato del cliente: te preparo la repregunta (no se reintenta solo).'
  }
  const tipo = a.tipoError && /^[a-z_]{2,20}$/.test(a.tipoError) ? ` (fallo de ${a.tipoError})` : ''
  return `❌ <b>El bot de ${cia} (${ramo}) no ha llegado a precio</b>${ref}${tipo}. No se reintenta solo: míralo en /correduria/tarificador.`
}

/**
 * Fecha del carné que devuelve `personaDeFicha` para tarificar. En MOTO solo vale un carné de moto (A, A1, A2): si la ficha solo
 * trae el B (`tipoCarnet` 'B' o ausente), su fecha NO es la de moto → `null`. `null` = no consta (nunca un valor de relleno). PURA.
 */
export function carneDePersonaFicha(p: object | null, ramo: string): string | null {
  const o = p as { fechaCarnet?: unknown; tipoCarnet?: unknown } | null
  const f = o !== null && typeof o.fechaCarnet === 'string' ? o.fechaCarnet.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null
  if (ramo === 'moto') {
    const tipo = typeof o?.tipoCarnet === 'string' ? o.tipoCarnet.toUpperCase().replace(/\s/g, '') : ''
    if (!CARNETS_MOTO_PRECIO.includes(tipo)) return null
  }
  return f
}
