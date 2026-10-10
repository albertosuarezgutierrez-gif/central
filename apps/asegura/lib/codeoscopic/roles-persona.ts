// Qué datos del ASEGURADO exige de verdad el vendor en vida, salud y decesos.
// PURO: entra la respuesta cruda de `GET /{ramo}/person-roles` (gratis), sale
// la lista de lo que falta. Sin red, sin BD.
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// `docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md` § 5: «Qué campos son obligatorios
// lo decide el rol, vía `GET /{ramo}/person-roles` → `fields[]` (`id`, `required`,
// `modifiable`, `pattern`, `requiredForRatingProducts`)». Hasta ahora vida,
// salud y decesos pedían precio con un mínimo adivinado (`revisarPersona`): lo
// que el vendor exigiera de más (profesión, fumador, peso…) era un 400 pagado.
// Aquí el vendor dice qué pide y nosotros lo contrastamos ANTES de gastar.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// 1. Fail-closed: si la respuesta no se puede leer (o no trae el rol del
//    asegurado), NO se cotiza. «No he podido mirarlo» no es «no hace falta nada».
// 2. Tabla EXPLÍCITA id del vendor → nuestro campo (`TABLA_CAMPOS_VENDOR`). Lo que
//    el vendor pida y no esté en la tabla —o esté pero este ramo no lo manda—
//    sale como «dato que falta: <id del vendor>». NUNCA se ignora en silencio.
// 3. Solo `required === true` bloquea. `requiredForRatingProducts` (campos que
//    exigen SOLO algunos productos) no bloquea: dejaría el ramo sin poder
//    cotizar por culpa de una compañía; esa compañía contestará por sí misma.
//
// 🚧 La FORMA de la respuesta no tiene fixture de vida/salud/decesos (cero
// pólizas, ningún GET real): se lee la que documenta hogar/auto (lista de roles
// `{ id, path, min, max, fields: [{ id, required, … }] }`, ver
// `docs/CODEOSCOPIC-API-PORTAL.md` § hogar) con tolerancia en el envoltorio. Si
// la forma real difiere, el resultado es `ok: false` (no se cotiza) y se corrige
// AQUÍ con la respuesta real a la vista.

export type RamoPersonas = 'vida' | 'salud' | 'decesos'

/**
 * `GET` del catálogo de roles de cada ramo. 🚧 `/health/person-roles` y
 * `/burial/person-roles` están en la referencia; `/term-life/person-roles` se
 * deduce del prefijo del ramo («Catálogos y roles de cada ramo»): si no existe,
 * contesta 404 y el ramo queda cerrado (fail-closed), no cotiza a ciegas.
 */
export const PATH_ROLES: Record<RamoPersonas, string> = {
  vida: '/term-life/person-roles',
  salud: '/health/person-roles',
  decesos: '/burial/person-roles',
}

/**
 * id de campo de rol del vendor → campos NUESTROS que lo cubren (todos tienen que
 * estar presentes). `null` = el vendor lo conoce pero nosotros no lo mandamos en
 * ningún ramo: se declara como dato que falta. Ids de la referencia § 5
 * («Ids de campo de rol vistos» + los que «también se mencionan en el spec»).
 */
export const TABLA_CAMPOS_VENDOR: Readonly<Record<string, readonly string[] | null>> = {
  identification: ['dni'],
  name: ['nombre', 'apellido1'],
  surname: ['apellido1'],
  surname2: ['apellido2'],
  birthDate: ['fechaNacimiento'],
  gender: ['sexo'],
  maritalStatus: ['estadoCivil'],
  phone: ['telefono'],
  email: ['email'],
  town: ['municipioResidenciaId', 'cpResidencia'],
  address: ['cpResidencia', 'municipioResidenciaId', 'tipoVia', 'nombreVia', 'numeroVia'],
  // Solo VIDA los manda (`insured.economicOccupation.code` / `insured.smoker`).
  economicOccupation: ['profesion'],
  smoker: ['fumador'],
  // El vendor los conoce y NO los mandamos: formato sin documentar (peso/altura),
  // o sin dato en la ficha (el resto). Salen como «dato que falta».
  weight: null,
  height: null,
  contactLanguage: null,
  drivingLicense: null,
  identificationExpirationDate: null,
  birthCountry: null,
}

/** Campos de la tabla que SOLO manda vida (en salud/decesos son «dato que falta»). */
const SOLO_VIDA: ReadonlySet<string> = new Set(['profesion', 'fumador'])

export type RolesPersonas = {
  /** ids de campo que exige el rol del ASEGURADO. */
  asegurado: string[]
  /** ids de campo que exige el rol del TOMADOR (en el titular, la misma persona va en los dos). */
  tomador: string[]
  /** `max` del rol del asegurado (`null` = el vendor no lo dice). */
  maxAsegurados: number | null
}

export type LecturaRoles = { ok: true; roles: RolesPersonas } | { ok: false; motivo: string }

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

function listaDeRoles(crudo: unknown): unknown[] | null {
  if (Array.isArray(crudo)) return crudo
  const o = obj(crudo)
  for (const k of ['roles', 'items', 'data', 'results', 'content']) {
    if (Array.isArray(o[k])) return o[k] as unknown[]
  }
  return null
}

function esRol(rol: Json, nombre: 'insured' | 'holder'): boolean {
  const id = str(rol.id)?.toLowerCase() ?? ''
  const path = str(rol.path)?.toLowerCase() ?? ''
  if (nombre === 'holder') return id === 'holder' || path === 'holder'
  return id.includes('insured') || path.includes('insured')
}

/** `null` = el rol no trae `fields[]` legible. */
function camposExigidos(rol: Json): string[] | null {
  if (!Array.isArray(rol.fields)) return null
  const ids: string[] = []
  for (const f of rol.fields) {
    const c = obj(f)
    const id = str(c.id)
    if (id && c.required === true && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Lee la respuesta cruda de `person-roles`. `ok: false` si no se reconoce la lista
 * de roles, si falta el rol del asegurado o si éste no trae `fields[]`: en esos
 * casos NO se sabe qué pide el vendor y no se cotiza.
 */
export function leerRolesPersonas(crudo: unknown): LecturaRoles {
  const lista = listaDeRoles(crudo)
  if (!lista || lista.length === 0) {
    return { ok: false, motivo: 'la respuesta de person-roles no trae ninguna lista de roles legible' }
  }
  const roles = lista.map(obj)
  const asegurado = roles.find((r) => esRol(r, 'insured'))
  if (!asegurado) {
    return {
      ok: false,
      motivo: `person-roles no trae el rol del asegurado (roles vistos: ${roles.map((r) => str(r.id) ?? str(r.path) ?? '?').join(', ')})`,
    }
  }
  const exigidosAsegurado = camposExigidos(asegurado)
  if (exigidosAsegurado === null) return { ok: false, motivo: 'el rol del asegurado no trae fields[] legible' }
  const tomador = roles.find((r) => esRol(r, 'holder'))
  const exigidosTomador = tomador ? camposExigidos(tomador) : []
  if (exigidosTomador === null) return { ok: false, motivo: 'el rol del tomador no trae fields[] legible' }
  const max = asegurado.max
  return {
    ok: true,
    roles: {
      asegurado: exigidosAsegurado,
      tomador: exigidosTomador,
      maxAsegurados: typeof max === 'number' && Number.isFinite(max) && max > 0 ? max : null,
    },
  }
}

export type ReparoRol = { campo: string; motivo: string }

/** ¿Hay valor? Un `false` (fumador = no) ES una respuesta; `''`, `null` y `undefined` no. */
function hayValor(v: unknown): boolean {
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return Number.isFinite(v)
  return typeof v === 'boolean'
}

/**
 * Lo que falta de `datos` según los ids exigidos por el vendor.
 *  - id mapeado y presente → nada.
 *  - id mapeado y ausente → `{ campo: <nuestro campo>, motivo }`: la pantalla sabe pintar ese hueco.
 *  - id sin mapear (o que este ramo no manda) → `{ campo: <id del vendor>, motivo: 'dato que falta: <id>…' }`.
 */
export function faltantesPorRoles(
  idsExigidos: readonly string[],
  datos: Readonly<Record<string, unknown>>,
  ramo: RamoPersonas,
  /** Campos nuestros que existen para ESTA persona (el asegurado adicional no tiene teléfono, por ejemplo). */
  camposDisponibles?: ReadonlySet<string>,
): ReparoRol[] {
  const out: ReparoRol[] = []
  const ya = new Set<string>()
  const meter = (campo: string, motivo: string) => {
    if (ya.has(campo)) return
    ya.add(campo)
    out.push({ campo, motivo })
  }
  for (const id of idsExigidos) {
    const nuestros = Object.prototype.hasOwnProperty.call(TABLA_CAMPOS_VENDOR, id) ? TABLA_CAMPOS_VENDOR[id] : undefined
    const mapeable =
      nuestros !== undefined &&
      nuestros !== null &&
      (ramo === 'vida' || !nuestros.some((c) => SOLO_VIDA.has(c))) &&
      (!camposDisponibles || nuestros.every((c) => camposDisponibles.has(c)))
    if (!mapeable) {
      meter(
        id,
        `dato que falta: ${id} — el vendor lo exige para el asegurado y esta pantalla no sabe mandarlo; no se cotiza hasta saber cómo`,
      )
      continue
    }
    for (const c of nuestros!) {
      if (!hayValor(datos[c])) meter(c, `el vendor lo exige para el asegurado (person-roles: «${id}»)`)
    }
  }
  return out
}

/** Campos nuestros que tiene un asegurado ADICIONAL (no hay teléfono, estado civil, dirección…). */
export const CAMPOS_ASEGURADO_ADICIONAL: ReadonlySet<string> = new Set([
  'dni',
  'nombre',
  'apellido1',
  'apellido2',
  'fechaNacimiento',
  'sexo',
])
