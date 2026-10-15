/**
 * El riesgo como pantalla (29/09/2026): figuras y variantes de un mismo riesgo.
 *
 * «Nosotros aseguramos riesgos: el riesgo no cambia, lo que cambia es la persona» (Alberto). Cada
 * tarificación de una oportunidad es una VARIANTE (P1, P2…) con su propia petición al vendor. Lo que
 * cambia entre dos variantes NO se guarda: se deriva aquí de las dos peticiones, para que no exista
 * una segunda verdad que se desincronice.
 *
 * Puro, sin BD. Lee la petición tal y como viaja a Codeoscopic (`holder`, `risk.owner`,
 * `risk.primaryDriver`, `risk.secondaryDriver`, `risk.circulationAddress`…). Una clave que falta
 * es «no consta», nunca un valor.
 */

export const ROLES_FIGURA = ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional', 'asegurado'] as const
export type RolFigura = (typeof ROLES_FIGURA)[number]

/**
 * Roles de UNA persona por riesgo (índice único parcial `oportunidad_figura_rol_unico_uq`, 10/10/2026). Sin
 * fila, el papel lo ocupa el tomador. Son los únicos que viajan en la foto de una variante (`FigurasVariante`).
 */
export const ROLES_FIGURA_UNICOS = ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'] as const
export type RolFiguraUnico = (typeof ROLES_FIGURA_UNICOS)[number]
/**
 * Roles de VARIAS personas (asegurados de salud/decesos). Cada una es una FICHA; la misma ficha no entra dos
 * veces (`oportunidad_figura_multi_uq`). Sin filas NO es «el tomador» ni «ninguno»: es que no consta.
 * Debe casar con el predicado del índice parcial del SQL `2026-10-10_figuras_multi.sql` (`rol <> 'asegurado'`).
 */
export const ROLES_FIGURA_MULTIPLES = ['asegurado'] as const
export type RolFiguraMultiple = (typeof ROLES_FIGURA_MULTIPLES)[number]

export const ETIQUETA_ROL: Record<RolFigura, string> = {
  tomador: 'Tomador',
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
  asegurado: 'Asegurado',
}

/** Cuántas personas admite un papel en un ramo. `max: 1` = una (o ninguna: sin fila, el tomador). */
export type CardinalidadRol = { rol: RolFigura; min: 0 | 1; max: number }

/** Asegurados por póliza que el comparador de salud admite (`risk.insureds`, hasta 10). Decesos: mismo tope. */
export const MAX_ASEGURADOS_PERSONAS = 10

/**
 * Los papeles de cada ramo con su cardinalidad: FUENTE ÚNICA (la pantalla y el puerto leen de aquí).
 * Auto/moto: exactamente los de siempre (moto: el vendor no tiene conductor ocasional). Hogar: propietario de la
 * vivienda y un asegurado (ninguno tiene por qué ser el tomador). Vida y comercio: un asegurado (puede no ser el tomador). Salud y decesos: varios asegurados. El resto: solo tomador.
 * Beneficiarios de vida: NO son figura (decisión de Alberto, 10/10/2026): cláusula de texto al emitir.
 */
export function cardinalidadesDelRamo(ramo: string): readonly CardinalidadRol[] {
  const uno = (rol: RolFigura, min: 0 | 1 = 0): CardinalidadRol => ({ rol, min, max: 1 })
  if (ramo === 'auto') return [uno('tomador', 1), uno('propietario'), uno('conductor_habitual'), uno('conductor_ocasional')]
  if (ramo === 'moto') return [uno('tomador', 1), uno('propietario'), uno('conductor_habitual')]
  // Hogar (fase 3, 10/10/2026): el propietario de la vivienda puede no ser el tomador (rol de una persona, sin migración).
  if (ramo === 'hogar') return [uno('tomador', 1), uno('propietario'), { rol: 'asegurado', min: 0, max: 1 }]
  if (ramo === 'vida' || ramo === 'comercio') return [uno('tomador', 1), { rol: 'asegurado', min: 0, max: 1 }]
  if (ramo === 'salud' || ramo === 'decesos') return [uno('tomador', 1), { rol: 'asegurado', min: 0, max: MAX_ASEGURADOS_PERSONAS }]
  return [uno('tomador', 1)]
}

/** Qué figuras admite cada ramo (en orden de pantalla). Moto: el vendor no tiene conductor ocasional. */
export function rolesDelRamo(ramo: string): readonly RolFigura[] {
  return cardinalidadesDelRamo(ramo).map((c) => c.rol)
}

/** Máximo de personas de ese papel en ese ramo; 0 = el ramo no lo tiene. */
export function maxDelRol(ramo: string, rol: RolFigura): number {
  return cardinalidadesDelRamo(ramo).find((c) => c.rol === rol)?.max ?? 0
}

export function esRolFigura(v: unknown): v is RolFigura {
  return typeof v === 'string' && (ROLES_FIGURA as readonly string[]).includes(v)
}
export function esRolFiguraUnico(v: unknown): v is RolFiguraUnico {
  return typeof v === 'string' && (ROLES_FIGURA_UNICOS as readonly string[]).includes(v)
}
/** Rol de varias personas en la BD (no confundir con «este ramo admite varias»: eso es `maxDelRol`). */
export function esRolMultiple(v: unknown): v is RolFiguraMultiple {
  return typeof v === 'string' && (ROLES_FIGURA_MULTIPLES as readonly string[]).includes(v)
}

/**
 * Ramos cuya petición saca el CÓDIGO POSTAL de la ficha del TOMADOR (13/10/2026): auto (dirección del `holder`,
 * obligatoria en `CarRisk`, y `risk.circulationAddress.postalCode`, que se supone donde vive) y moto
 * (`circulationAddress.postalCode`, obligatorio). Hogar lleva el CP de la VIVIENDA (lo vigila `datosVivienda`, no la
 * figura); vida, salud y decesos no lo mandan.
 */
export function ramoPideCpDelTomador(ramo: string): boolean {
  return ramo === 'auto' || ramo === 'moto'
}

/**
 * ¿Falta el código postal? `true` = la ficha no trae uno de 5 dígitos (el vendor no admite otro) · `false` = lo trae ·
 * `null` = no se pudo leer la ficha (`undefined`): no se afirma que falte.
 */
export function faltaCodigoPostal(cp: string | null | undefined): boolean | null {
  if (cp === undefined) return null
  return !/^\d{5}$/.test((cp ?? '').trim())
}

/** Foto de figuras de una variante: cliente_id por rol; `null` = la misma persona que el tomador. */
export type FigurasVariante = Partial<Record<RolFiguraUnico, string | null>>

/**
 * Normaliza lo que llega por el puerto: solo roles de UNA persona y uuids. Lo demás se descarta (los asegurados
 * no caben en esta forma `rol → cliente_id`: su foto va aparte, en la clave `asegurados`, ver `fotoAsegurados`).
 */
export function limpiarFiguras(v: unknown): FigurasVariante | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const out: FigurasVariante = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!esRolFiguraUnico(k)) continue
    if (x === null) out[k] = null
    else if (typeof x === 'string' && UUID.test(x)) out[k] = x
  }
  return Object.keys(out).length > 0 ? out : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Una diferencia entre dos variantes. `antes`/`despues` `null` = no consta en esa petición (nunca «0» ni «no»).
 * `tipo` solo en las personas de una LISTA (asegurados de salud/decesos): `alta` = entra en la posterior, `baja` = sale.
 */
export type Diferencia = { campo: string; antes: string | null; despues: string | null; tipo?: 'alta' | 'baja' }

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null)
function en(o: unknown, ruta: string): unknown {
  let x: unknown = o
  for (const k of ruta.split('.')) {
    const y = obj(x)
    if (!y) return undefined
    x = y[k]
  }
  return x
}
function escalar(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const o = obj(v)
  if (o && (typeof o.id === 'string' || typeof o.id === 'number')) return String(o.id)
  if (o && (typeof o.code === 'string' || typeof o.code === 'number')) return String(o.code)
  return null
}

/** Una persona de la petición: su identidad (DNI) manda; el nombre es solo la etiqueta. */
type PersonaPeticion = { dni: string | null; nombre: string | null; nacimiento: string | null; carnet: string | null }
function persona(v: unknown): PersonaPeticion | null {
  const o = obj(v)
  if (!o) return null
  const dni = escalar(en(o, 'identificationDocument.id'))
  const nombre = [o.name, o.surname, o.surname2].filter((x) => typeof x === 'string' && x.trim() !== '').join(' ') || null
  const lic = Array.isArray(o.drivingLicenses) ? obj(o.drivingLicenses[0]) : null
  return { dni: dni ? dni.toUpperCase() : null, nombre, nacimiento: escalar(o.birthDate), carnet: lic ? escalar(lic.date) : null }
}
const mismaPersona = (a: PersonaPeticion | null, b: PersonaPeticion | null) =>
  a === null || b === null ? a === b : a.dni !== null && a.dni === b.dni

const PERSONAS: Array<[string, string]> = [
  ['holder', 'Tomador'],
  ['risk.owner', 'Propietario'],
  ['risk.primaryDriver', 'Conductor habitual'],
  ['risk.secondaryDriver', 'Conductor ocasional'],
]

/** Datos del riesgo que cambian el precio, con su nombre en castellano. */
const CAMPOS: Array<[string, string]> = [
  ['effectiveDate', 'Fecha de efecto'],
  ['risk.vehicle.code', 'Vehículo'],
  ['risk.registrationPlate', 'Matrícula'],
  ['risk.circulationAddress.postalCode', 'CP de circulación'],
  ['risk.garageType', 'Garaje'],
  ['risk.kilometersPerYear', 'Km al año'],
  ['risk.drivingExperience', 'Experiencia en moto'],
  ['risk.previouslyInsured', 'Asegurado antes'],
  ['risk.previousInsurance.previousCompany.code', 'Compañía anterior'],
  ['risk.previousInsurance.yearsWithoutAccidents', 'Años sin siniestros'],
  ['risk.previousInsurance.lastFiveYearsAccidents', 'Siniestros últimos 5 años'],
  // Hogar
  ['risk.address.postalCode', 'CP de la vivienda'],
  ['risk.buildingsLimit', 'Capital continente'],
  ['risk.contentsLimit', 'Capital contenido'],
  ['risk.use', 'Régimen'],
  ['risk.occupancy', 'Uso de la vivienda'],
]

/** Ids con los que el vendor nombra los ramos que SÍ comparamos (`insuranceLine.id`, minúsculas). */
const LINEAS_VEHICULO = new Set(['car', 'auto', 'motorcycle', 'moto', 'motorbike'])
const LINEAS_HOGAR = new Set(['home', 'hogar', 'household', 'homeowner'])
/** Salud y decesos (13/10/2026): `risk.insureds[]` (`HealthRisk_V1`, `BurialRisk_V1`). */
const LINEAS_LISTA_ASEGURADOS = new Set(['health', 'salud', 'burial', 'decesos'])
/** Vida (13/10/2026): `risk.insured` + `risk.deathBenefit` (`TermLifeRisk_V1`). */
const LINEAS_VIDA = new Set(['termlife', 'life', 'vida'])

type LineaComparable = 'vehiculo' | 'hogar' | 'asegurados' | 'vida'

/** El ramo de una petición si tiene comparador; `null` si no se lee o su ramo no se compara todavía. */
function lineaComparable(peticion: unknown): LineaComparable | null {
  const id = escalar(en(peticion, 'insuranceLine.id') ?? en(peticion, 'insuranceLine'))?.toLowerCase()
  if (!id) return null
  if (LINEAS_VEHICULO.has(id)) return 'vehiculo'
  if (LINEAS_HOGAR.has(id)) return 'hogar'
  if (LINEAS_LISTA_ASEGURADOS.has(id)) return 'asegurados'
  if (LINEAS_VIDA.has(id)) return 'vida'
  return null
}

// ─── Foto de asegurados de una variante (13/10/2026) ────────────────────────
//
// La petición enviada YA lleva nombre, nacimiento y sexo de cada asegurado: eso no se copia. Lo único que se guarda
// aparte (en `tarificaciones.figuras`, clave `asegurados`) es QUIÉN es cada uno: el cliente_id de su ficha, en el
// orden en que viajan (`risk.insureds[1..]` en salud/decesos; `risk.insured` en vida, `[]` = el tomador). Nada de DNI.

/** Lo que se lee de la foto de una variante. `asegurados: null` = no consta (variante anterior, o tecleada a mano). */
export type FotoAsegurados = { tomador: string | null; asegurados: string[] | null }

/** PURA. Lee `tarificaciones.figuras`: solo uuids; una lista con algo que no lo es NO consta (no se adivina). */
export function fotoAsegurados(figuras: unknown): FotoAsegurados {
  const o = obj(figuras)
  const tomador = typeof o?.tomador === 'string' && UUID.test(o.tomador) ? o.tomador : null
  const lista = o?.asegurados
  const asegurados = Array.isArray(lista) && lista.every((x) => typeof x === 'string' && UUID.test(x)) ? (lista as string[]) : null
  return { tomador, asegurados }
}

/**
 * PURA. Lo que se guarda en `tarificaciones.figuras`: la foto de figuras y, si consta, la de asegurados (clave
 * `asegurados`). `null` = no consta ninguna. Solo uuids: un id que no lo es invalida la lista entera (no se recorta).
 */
export function fotoVarianteJson(
  figuras: Record<string, string | null> | null | undefined,
  asegurados: readonly string[] | null | undefined,
  supuestos?: readonly SupuestoVariante[] | null,
): string | null {
  const lista = Array.isArray(asegurados) && asegurados.every((x) => typeof x === 'string' && UUID.test(x)) ? [...asegurados] : null
  const sup = supuestos === undefined || supuestos === null ? null : limpiarSupuestosVariante(supuestos)
  if (!figuras && lista === null && sup === null) return null
  return JSON.stringify({ ...(figuras ?? {}), ...(lista !== null ? { asegurados: lista } : {}), ...(sup !== null ? { supuestos: sup } : {}) })
}

// ─── Supuestos con los que se pidió el precio (15/10/2026) ──────────────────
//
// Qué campos viajaron como SUPUESTO (nadie los dijo: km por defecto, compra = matriculación, garaje por defecto, años
// en la compañía topados…) al pedir ESTE precio. Lo declara la pantalla que cotiza (la única que sabe qué era supuesto:
// `supuestosAlPedir` de plataforma) y se guarda en `tarificaciones.figuras`, clave `supuestos`, sin migración (como
// `asegurados`). Tres estados: `null` = no consta (tarificación anterior, o una puerta que no lo declara) ≠ `[]` = se
// pidió sin supuestos ≠ la lista.

export type SupuestoVariante = { campo: string; texto: string }
const MAX_SUPUESTOS = 20
const MAX_TEXTO_SUPUESTO = 200

/** PURA. Sanea lo que llega por el puerto: solo `{campo, texto}` de texto no vacío, con tope. No es lista → `null`. */
export function limpiarSupuestosVariante(v: unknown): SupuestoVariante[] | null {
  if (!Array.isArray(v)) return null
  const out: SupuestoVariante[] = []
  const vistos = new Set<string>()
  for (const x of v) {
    const o = obj(x)
    const campo = typeof o?.campo === 'string' ? o.campo.trim().slice(0, 60) : ''
    const texto = typeof o?.texto === 'string' ? o.texto.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_SUPUESTO) : ''
    if (campo === '' || texto === '' || vistos.has(campo)) continue
    vistos.add(campo)
    out.push({ campo, texto })
    if (out.length >= MAX_SUPUESTOS) break
  }
  return out
}

/** PURA. Lee los supuestos de `tarificaciones.figuras`. Sin la clave (o con forma rara) = `null`, no consta. */
export function supuestosDeFoto(figuras: unknown): SupuestoVariante[] | null {
  const o = obj(figuras)
  if (!o || !Array.isArray(o.supuestos)) return null
  return limpiarSupuestosVariante(o.supuestos)
}

/** Un asegurado tal como viajó: identidad (ficha, DNI) para emparejar; lo demás, lo que se enseña. El DNI NUNCA sale. */
export type AseguradoPeticion = { ficha: string | null; dni: string | null; nombre: string | null; nacimiento: string | null; sexo: string | null }

function sexoDe(v: unknown): string | null {
  const s = escalar(v)
  if (s === null) return null
  const k = s.toLowerCase()
  return k === 'male' ? 'hombre' : k === 'female' ? 'mujer' : k
}

function aseguradoDe(v: unknown, ficha: string | null): AseguradoPeticion | null {
  const p = persona(v)
  if (!p) return null
  return { ficha, dni: p.dni, nombre: p.nombre, nacimiento: p.nacimiento, sexo: sexoDe(en(v, 'gender')) }
}

const normalNombre = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * ¿La misma persona? Por IDENTIDAD: ficha → DNI → nombre. Dos fichas (o dos DNI) distintas no se funden jamás.
 * `null` = no se puede saber (sin ningún dato con que decidirlo).
 */
function mismaIdentidad(a: AseguradoPeticion, b: AseguradoPeticion): boolean | null {
  if (a.ficha && b.ficha) return a.ficha === b.ficha
  if (a.dni && b.dni) return a.dni === b.dni
  if (a.nombre && b.nombre) return normalNombre(a.nombre) === normalNombre(b.nombre)
  return null
}

/** Los asegurados de salud/decesos con su ficha cuando la foto la da. `null` = la lista no se puede leer. */
function listaAsegurados(peticion: unknown, foto: FotoAsegurados): AseguradoPeticion[] | null {
  const lista = en(peticion, 'risk.insureds')
  if (!Array.isArray(lista) || lista.length === 0) return null
  // La foto solo vale si cuadra con la lista enviada; si no, se ignora (nunca se reparte por posición a ojo).
  const fichas = foto.asegurados !== null && foto.asegurados.length === lista.length - 1 ? foto.asegurados : null
  const holder = JSON.stringify(en(peticion, 'holder') ?? null)
  const out: AseguradoPeticion[] = []
  for (const [i, x] of lista.entries()) {
    // El primero es el tomador SOLO si es literalmente el `holder` (así lo arma `construirPeticionSalud/Decesos`).
    const ficha = i === 0 ? (JSON.stringify(x) === holder ? foto.tomador : null) : (fichas?.[i - 1] ?? null)
    const a = aseguradoDe(x, ficha)
    if (!a) return null
    out.push(a)
  }
  return out
}

/** El asegurado de vida con su ficha: `[id]` = esa ficha; `[]` = el tomador. `null` = no se lee. */
function aseguradoVida(peticion: unknown, foto: FotoAsegurados): AseguradoPeticion | null {
  const ficha = foto.asegurados === null ? null : foto.asegurados.length === 1 ? foto.asegurados[0] : foto.asegurados.length === 0 ? foto.tomador : null
  return aseguradoDe(en(peticion, 'risk.insured'), ficha)
}

/** Nombre, nacimiento y sexo de la MISMA persona en las dos variantes: correcciones del dato. */
function correcciones(etiqueta: string, a: AseguradoPeticion, b: AseguradoPeticion): Diferencia[] {
  const r: Diferencia[] = []
  if ((a.nombre && normalNombre(a.nombre)) !== (b.nombre && normalNombre(b.nombre))) r.push({ campo: `${etiqueta}: nombre`, antes: a.nombre, despues: b.nombre })
  if (a.nacimiento !== b.nacimiento) r.push({ campo: `${etiqueta}: nacimiento`, antes: a.nacimiento, despues: b.nacimiento })
  if (a.sexo !== b.sexo) r.push({ campo: `${etiqueta}: sexo`, antes: a.sexo, despues: b.sexo })
  return r
}

/**
 * PURA. Altas, bajas y correcciones de una lista de asegurados, emparejados por IDENTIDAD, nunca por posición.
 * `null` = no se puede emparejar con seguridad (alguien sin ningún dato, o dos candidatos para la misma persona).
 */
export function diferenciasAsegurados(antes: readonly AseguradoPeticion[], despues: readonly AseguradoPeticion[]): Diferencia[] | null {
  const pareja = new Map<number, number>()
  const usadosB = new Set<number>()
  for (const [i, a] of antes.entries()) {
    const cand: number[] = []
    for (const [j, b] of despues.entries()) {
      const m = mismaIdentidad(a, b)
      if (m === null) return null
      if (m) cand.push(j)
    }
    if (cand.length > 1) return null
    if (cand.length === 1) {
      if (usadosB.has(cand[0])) return null
      pareja.set(i, cand[0])
      usadosB.add(cand[0])
    }
  }
  const r: Diferencia[] = []
  for (const [i, a] of antes.entries()) {
    const j = pareja.get(i)
    if (j === undefined) r.push({ campo: 'Asegurado', antes: a.nombre, despues: null, tipo: 'baja' })
    else r.push(...correcciones(`Asegurado ${a.nombre ?? despues[j].nombre ?? ''}`.trim(), a, despues[j]))
  }
  for (const [j, b] of despues.entries()) if (!usadosB.has(j)) r.push({ campo: 'Asegurado', antes: null, despues: b.nombre, tipo: 'alta' })
  return r
}

/** Vida: lo que del riesgo cambia el precio, además del asegurado. Fumador en palabras; ausente = no consta. */
const CAMPOS_VIDA: Array<[string, string]> = [
  ['risk.deathBenefit', 'Capital de fallecimiento'],
  ['risk.insured.economicOccupation.code', 'Profesión (CNO)'],
]
const siNo = (v: unknown): string | null => (v === true ? 'sí' : v === false ? 'no' : escalar(v))

/**
 * Qué cambia de la variante `antes` a la variante `despues`, en palabras. Las personas se comparan
 * por DNI: el mismo DNI con otro carnet o nacimiento es una CORRECCIÓN del dato; otro DNI es otra
 * persona. Sin petición legible de alguna de las dos, `null` = «no se puede comparar», nunca «igual».
 *
 * Salud, decesos y vida (13/10/2026): los asegurados se emparejan por identidad (ficha de la foto → DNI → nombre),
 * con altas y bajas explícitas; `fotos` es `tarificaciones.figuras` de cada variante (puede faltar: no consta).
 */
export function diferenciasVariante(antes: unknown, despues: unknown, fotos?: { antes?: unknown; despues?: unknown }): Diferencia[] | null {
  if (!obj(antes) || !obj(despues)) return null
  // H1 (10/10/2026): solo se afirma «mismos datos» donde hay comparador. RC, comercio… no tienen rutas
  // comparadas: «no comparado» ≠ «igual». Línea ilegible = null.
  const la = lineaComparable(antes)
  if (la === null || la !== lineaComparable(despues)) return null
  const fa = fotoAsegurados(fotos?.antes)
  const fb = fotoAsegurados(fotos?.despues)
  const r: Diferencia[] = []
  for (const [ruta, campo] of PERSONAS) {
    const a = persona(en(antes, ruta))
    const b = persona(en(despues, ruta))
    if (a === null && b === null) continue
    if (!mismaPersona(a, b)) {
      r.push({ campo, antes: a?.nombre ?? null, despues: b?.nombre ?? null })
      continue
    }
    if (a && b && a.nacimiento !== b.nacimiento) r.push({ campo: `${campo}: nacimiento`, antes: a.nacimiento, despues: b.nacimiento })
    if (a && b && a.carnet !== b.carnet) r.push({ campo: `${campo}: carnet`, antes: a.carnet, despues: b.carnet })
  }
  if (la === 'asegurados') {
    const xa = listaAsegurados(antes, fa)
    const xb = listaAsegurados(despues, fb)
    if (!xa || !xb) return null
    const d = diferenciasAsegurados(xa, xb)
    if (d === null) return null
    r.push(...d)
  }
  if (la === 'vida') {
    const a = aseguradoVida(antes, fa)
    const b = aseguradoVida(despues, fb)
    if (!a || !b) return null
    const m = mismaIdentidad(a, b)
    if (m === null) return null
    if (!m) r.push({ campo: 'Asegurado', antes: a.nombre, despues: b.nombre })
    else r.push(...correcciones('Asegurado', a, b))
    for (const [ruta, campo] of CAMPOS_VIDA) {
      const x = escalar(en(antes, ruta))
      const y = escalar(en(despues, ruta))
      if (x !== y) r.push({ campo, antes: x, despues: y })
    }
    const fx = siNo(en(antes, 'risk.insured.smoker'))
    const fy = siNo(en(despues, 'risk.insured.smoker'))
    if (fx !== fy) r.push({ campo: 'Fumador', antes: fx, despues: fy })
  }
  for (const [ruta, campo] of CAMPOS) {
    const a = escalar(en(antes, ruta))
    const b = escalar(en(despues, ruta))
    if (a !== b) r.push({ campo, antes: a, despues: b })
  }
  return r
}

/**
 * PURA. Una diferencia en palabras: «Alta de asegurado: Ana Pérez» · «Baja de asegurado: Luis» ·
 * «CP: 41003 → 11520». Un lado `null` es «sin dato» (no consta), nunca un 0 inventado.
 */
export function textoDiferencia(d: Diferencia): string {
  const v = (x: string | null) => x ?? 'sin dato'
  if (d.tipo === 'alta') return `Alta de ${d.campo.toLowerCase()}: ${v(d.despues)}`
  if (d.tipo === 'baja') return `Baja de ${d.campo.toLowerCase()}: ${v(d.antes)}`
  return `${d.campo}: ${v(d.antes)} → ${v(d.despues)}`
}

/** PURA. Lee una diferencia que llega por el puerto (JSON). Sin `campo` no es una diferencia. */
export function leerDiferencia(c: unknown): Diferencia | null {
  const d = obj(c)
  if (!d) return null
  const t = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x : null)
  const campo = t(d.campo)
  if (!campo) return null
  const tipo = d.tipo === 'alta' || d.tipo === 'baja' ? d.tipo : undefined
  return { campo, antes: t(d.antes), despues: t(d.despues), ...(tipo ? { tipo } : {}) }
}

/** Una línea para la fila del historial: «Tomador: Manuel → Antonio · CP 41003 → 11520». */
export function resumenDiferencias(d: Diferencia[] | null): string {
  if (d === null) return 'No se puede comparar con la anterior'
  if (d.length === 0) return 'Mismos datos que la anterior'
  return d.map(textoDiferencia).join(' · ')
}
