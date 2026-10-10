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

/** Foto de figuras de una variante: cliente_id por rol; `null` = la misma persona que el tomador. */
export type FigurasVariante = Partial<Record<RolFiguraUnico, string | null>>

/**
 * Normaliza lo que llega por el puerto: solo roles de UNA persona y uuids. Lo demás se descarta (los asegurados
 * no caben en esta forma `rol → cliente_id`; su foto por variante es trabajo pendiente de la fase 2).
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

export type Diferencia = { campo: string; antes: string | null; despues: string | null }

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

/** El ramo de una petición si tiene comparador; `null` si no se lee o su ramo no se compara todavía. */
function lineaComparable(peticion: unknown): 'vehiculo' | 'hogar' | null {
  const id = escalar(en(peticion, 'insuranceLine.id') ?? en(peticion, 'insuranceLine'))?.toLowerCase()
  if (!id) return null
  if (LINEAS_VEHICULO.has(id)) return 'vehiculo'
  if (LINEAS_HOGAR.has(id)) return 'hogar'
  return null
}

/**
 * Qué cambia de la variante `antes` a la variante `despues`, en palabras. Las personas se comparan
 * por DNI: el mismo DNI con otro carnet o nacimiento es una CORRECCIÓN del dato; otro DNI es otra
 * persona. Sin petición legible de alguna de las dos, `null` = «no se puede comparar», nunca «igual».
 */
export function diferenciasVariante(antes: unknown, despues: unknown): Diferencia[] | null {
  if (!obj(antes) || !obj(despues)) return null
  // H1 (10/10/2026): solo se afirma «mismos datos» donde hay comparador. Vida, salud, decesos, RC… no
  // tienen rutas comparadas (`risk.insured`, capital…): «no comparado» ≠ «igual». Línea ilegible = null.
  const la = lineaComparable(antes)
  if (la === null || la !== lineaComparable(despues)) return null
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
  for (const [ruta, campo] of CAMPOS) {
    const a = escalar(en(antes, ruta))
    const b = escalar(en(despues, ruta))
    if (a !== b) r.push({ campo, antes: a, despues: b })
  }
  return r
}

/** Una línea para la fila del historial: «Tomador: Manuel → Antonio · CP 41003 → 11520». */
export function resumenDiferencias(d: Diferencia[] | null): string {
  if (d === null) return 'No se puede comparar con la anterior'
  if (d.length === 0) return 'Mismos datos que la anterior'
  return d.map((x) => `${x.campo}: ${x.antes ?? '—'} → ${x.despues ?? '—'}`).join(' · ')
}
