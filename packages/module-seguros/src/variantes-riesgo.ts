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

export const ROLES_FIGURA = ['tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'] as const
export type RolFigura = (typeof ROLES_FIGURA)[number]

export const ETIQUETA_ROL: Record<RolFigura, string> = {
  tomador: 'Tomador',
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
}

/** Qué figuras admite cada ramo. Moto: el vendor no tiene conductor ocasional. */
export function rolesDelRamo(ramo: string): readonly RolFigura[] {
  if (ramo === 'auto') return ROLES_FIGURA
  if (ramo === 'moto') return ['tomador', 'propietario', 'conductor_habitual']
  return ['tomador']
}

export function esRolFigura(v: unknown): v is RolFigura {
  return typeof v === 'string' && (ROLES_FIGURA as readonly string[]).includes(v)
}

/** Foto de figuras de una variante: cliente_id por rol; `null` = la misma persona que el tomador. */
export type FigurasVariante = Partial<Record<RolFigura, string | null>>

/** Normaliza lo que llega por el puerto: solo roles conocidos y uuids. Lo demás se descarta. */
export function limpiarFiguras(v: unknown): FigurasVariante | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const out: FigurasVariante = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!esRolFigura(k)) continue
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

/**
 * Qué cambia de la variante `antes` a la variante `despues`, en palabras. Las personas se comparan
 * por DNI: el mismo DNI con otro carnet o nacimiento es una CORRECCIÓN del dato; otro DNI es otra
 * persona. Sin petición legible de alguna de las dos, `null` = «no se puede comparar», nunca «igual».
 */
export function diferenciasVariante(antes: unknown, despues: unknown): Diferencia[] | null {
  if (!obj(antes) || !obj(despues)) return null
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
