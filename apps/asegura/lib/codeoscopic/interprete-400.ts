// Traduce el 400 de validación de Codeoscopic a NUESTROS campos, para que un
// «The road name of the address of the holder is mandatory.» deje de ser un
// error que se enseña tal cual y pase a ser un hueco que la pantalla pide.
// PURO: entra el texto del vendor, salen campos. Sin red, sin BD.
//
// ─── Por qué existe ─────────────────────────────────────────────────────────
// Once 400 reales (12/09/2026) y cada uno costó un PR: leer el mensaje, mapear
// el campo, añadir el input. El mensaje del vendor es semi-estructurado —
// «The <campo> of the <papel> is mandatory.», una línea por campo— así que
// mapearlo es determinista. Lo que NO se reconoce sale en `noReconocidos` con
// el texto íntegro: un mensaje desconocido es un hallazgo, nunca se calla.
//
// ─── Lo que NO hace, a propósito ────────────────────────────────────────────
// No inventa valores. Aquí solo se dice QUÉ falta; de dónde sale el valor lo
// decide la cascada del caller (ficha → corredor), y nada personal se supone.

import type { DatosAuto, Reparo } from './peticion-auto.ts'

/** Los papeles en los que va la persona. `holder` siempre; el resto según ramo. */
export type Papel = 'holder' | 'owner' | 'primaryDriver' | 'secondaryDriver'

/**
 * Los campos de la PERSONA que sabemos escribir en un proyecto ya creado
 * (mismas claves que `construirPersona()` manda al cotizar).
 */
export type CampoPersona =
  | 'nombreVia'
  | 'numeroVia'
  | 'tipoVia'
  | 'cpResidencia'
  | 'municipioResidenciaId'
  | 'dni'
  | 'nombre'
  | 'apellido1'
  | 'fechaNacimiento'
  | 'sexo'
  | 'estadoCivil'
  | 'telefono'
  | 'fechaCarnet'
  | 'email'

export const CAMPOS_PERSONA: readonly CampoPersona[] = [
  'nombreVia',
  'numeroVia',
  'tipoVia',
  'cpResidencia',
  'municipioResidenciaId',
  'dni',
  'nombre',
  'apellido1',
  'fechaNacimiento',
  'sexo',
  'estadoCivil',
  'telefono',
  'fechaCarnet',
  'email',
]

export function esCampoPersona(v: unknown): v is CampoPersona {
  return typeof v === 'string' && (CAMPOS_PERSONA as readonly string[]).includes(v)
}

export type CampoVendor = {
  campo: keyof DatosAuto
  /** En qué papeles lo pide. Vacío = el mensaje no nombra ninguno. */
  papeles: Papel[]
  /** Las líneas literales del vendor que llevaron a este campo. */
  textos: string[]
}

export type Interpretacion = {
  campos: CampoVendor[]
  /** Líneas que no se han sabido mapear. Se enseñan enteras: son un hallazgo. */
  noReconocidos: string[]
  /** Todas las líneas, tal cual, por si hay que leerlas. */
  lineas: string[]
}

// Cada regla casa contra la línea en minúsculas. El orden importa: la primera
// que casa gana, así que las más específicas van antes («primary driver» antes
// que «driver», «postal code» antes que «address», y la dirección de
// CIRCULACIÓN —que es del riesgo, no de la persona— antes que la de residencia).
const REGLAS: ReadonlyArray<readonly [RegExp, keyof DatosAuto]> = [
  [/circulation address.*postal code|postal code.*circulation address/, 'cpCirculacion'],
  [/circulation address.*\btown\b|\btown\b.*circulation address/, 'municipioCirculacionId'],
  [/road name/, 'nombreVia'],
  [/road number/, 'numeroVia'],
  [/road type/, 'tipoVia'],
  [/e-?mail/, 'email'],
  [/postal code|zip code/, 'cpResidencia'],
  [/\btown\b/, 'municipioResidenciaId'],
  [/identification document|\bnif\b|\bdni\b|document number/, 'dni'],
  [/birth ?date|date of birth/, 'fechaNacimiento'],
  [/driving licen[cs]e|driver'?s licen[cs]e/, 'fechaCarnet'],
  [/\bphone|telephone|mobile/, 'telefono'],
  [/marital status/, 'estadoCivil'],
  [/\bgender\b|\bsex\b/, 'sexo'],
  [/\bsurname|last name|family name/, 'apellido1'],
  [/\bfirst name\b|\bname\b/, 'nombre'],
  [/effective date/, 'fechaEfecto'],
  [/registration plate|license plate/, 'matricula'],
  [/registration date/, 'fechaMatriculacion'],
  [/kilomet/, 'kmAnuales'],
  [/garage/, 'garaje'],
]

const PAPELES: ReadonlyArray<readonly [RegExp, Papel]> = [
  [/primary driver/, 'primaryDriver'],
  [/secondary driver/, 'secondaryDriver'],
  [/\bowner\b/, 'owner'],
  [/\bholder\b/, 'holder'],
]

/**
 * Saca las líneas del `message` del vendor. Acepta tanto el `detalle` de
 * `ErrorCodeoscopic` (JSON) como su `message` entero (`codeoscopic_validacion:
 * {...}`).
 *
 * 🚨 En producción el `detalle` viene RECORTADO a 300 caracteres
 * (`recortar()` en `cliente.ts`, para no arrastrar PII a los logs), así que el
 * JSON casi nunca cierra: el 11º 400 real medía 334. Por eso, si `JSON.parse`
 * falla, se extrae `"message":"…"` a mano hasta la comilla de cierre o hasta
 * donde llegue el texto, y se des-escapan los `\n` — que en el JSON son dos
 * caracteres y sobreviven al recorte. Si tampoco hay `message`, el texto
 * entero es una única línea.
 */
export function lineasDelVendor(mensajeCrudo: string): string[] {
  const sinPrefijo = mensajeCrudo.replace(/^codeoscopic_[a-z-]+:\s*/, '')
  const inicioJson = sinPrefijo.indexOf('{')
  let texto = sinPrefijo
  if (inicioJson !== -1) {
    const json = sinPrefijo.slice(inicioJson)
    try {
      const cuerpo = JSON.parse(json) as { message?: unknown; error?: unknown }
      if (typeof cuerpo.message === 'string' && cuerpo.message.trim()) texto = cuerpo.message
      else if (typeof cuerpo.error === 'string' && cuerpo.error.trim()) texto = cuerpo.error
    } catch {
      const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(json)
      if (m) texto = desescapar(m[1])
    }
  }
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
}

function desescapar(s: string): string {
  return s.replace(/\\(n|r|t|"|\\)/g, (_, c: string) =>
    c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c,
  )
}

export function interpretarError400(mensajeCrudo: string): Interpretacion {
  const lineas = lineasDelVendor(mensajeCrudo)
  const porCampo = new Map<keyof DatosAuto, CampoVendor>()
  const noReconocidos: string[] = []

  for (const linea of lineas) {
    const l = linea.toLowerCase()
    const regla = REGLAS.find(([re]) => re.test(l))
    if (!regla) {
      noReconocidos.push(linea)
      continue
    }
    const campo = regla[1]
    const papel = PAPELES.find(([re]) => re.test(l))?.[1]
    // 🚨 Un campo de la PERSONA solo se acepta si el vendor dice DE QUIÉN es.
    // «The postal code … is mandatory» sin papel puede ser el del riesgo, y
    // escribirlo en el tomador sería inventar una dirección. Se enseña entero.
    if (esCampoPersona(campo) && !papel) {
      noReconocidos.push(linea)
      continue
    }
    const actual = porCampo.get(campo) ?? { campo, papeles: [], textos: [] }
    if (papel && !actual.papeles.includes(papel)) actual.papeles.push(papel)
    actual.textos.push(linea)
    porCampo.set(campo, actual)
  }

  return { campos: [...porCampo.values()], noReconocidos, lineas }
}

/** Los campos interpretados como `Reparo`, que es lo que la pantalla ya sabe pintar. */
export function reparosDe(interp: Interpretacion): Reparo[] {
  return interp.campos.map((c) => ({
    campo: c.campo,
    motivo: `la compañía lo exige para confirmar el precio: «${c.textos[0]}»`,
  }))
}

// ─── Escribir un campo en la persona del proyecto (mismas claves que al cotizar) ──

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const CAMPOS_DIRECCION: readonly CampoPersona[] = [
  'nombreVia',
  'numeroVia',
  'tipoVia',
  'cpResidencia',
  'municipioResidenciaId',
]

/**
 * Devuelve la persona con TODOS los `valores` escritos en la forma del vendor.
 * No muta.
 *
 * 🚨 `nombreVia`/`cpResidencia`/`municipioResidenciaId` viven DENTRO de
 * `addresses[0]`, y una dirección solo es válida con sus DOS mitades (CP +
 * municipio). Por eso se aplican JUNTOS: si la persona no tenía dirección y
 * tras aplicar lo que viene no quedan las dos mitades, no se crea ninguna
 * —mandar media dirección es un 400 seguro— y lo delata `leerCampoPersona()`.
 */
export function aplicarCamposPersona(persona: unknown, valores: Partial<Record<CampoPersona, string>>): Json {
  let p: Json = { ...obj(persona) }
  const campos = (Object.keys(valores) as CampoPersona[]).filter((c) => typeof valores[c] === 'string')

  const deDireccion = campos.filter((c) => CAMPOS_DIRECCION.includes(c))
  if (deDireccion.length > 0) {
    const direcciones = arr(p.addresses)
    const habia = direcciones.length > 0
    const d0: Json = { ...obj(direcciones[0]), primary: true }
    for (const c of deDireccion) {
      const v = (valores[c] as string).trim()
      if (c === 'nombreVia') d0.roadName = v
      if (c === 'numeroVia') d0.roadNumber = v
      // 🚨 `v` ya tiene que ser el id del catálogo `/road-types` en este punto
      // (lo resuelve `valoresPersonaDesdeFicha`, emparejando contra el catálogo
      // vivo): esta función es PURA y no valida catálogos, solo coloca el valor.
      if (c === 'tipoVia') d0.roadType = { id: v }
      if (c === 'cpResidencia') d0.postalCode = v
      if (c === 'municipioResidenciaId') d0.town = { ...obj(d0.town), id: Number(v) }
    }
    const completa = str(d0.postalCode) !== null && obj(d0.town).id !== undefined
    if (habia || completa) p.addresses = [d0, ...direcciones.slice(1)]
  }

  for (const c of campos) {
    if (CAMPOS_DIRECCION.includes(c)) continue
    p = aplicarCampoPersona(p, c, valores[c] as string)
  }
  return p
}

/** Un solo campo. Para los de dirección delega en `aplicarCamposPersona` (misma guarda). */
export function aplicarCampoPersona(persona: unknown, campo: CampoPersona, valor: string): Json {
  if (CAMPOS_DIRECCION.includes(campo)) return aplicarCamposPersona(persona, { [campo]: valor })
  const p: Json = { ...obj(persona) }
  const v = valor.trim()
  switch (campo) {
    case 'nombreVia':
    case 'numeroVia':
    case 'tipoVia':
    case 'cpResidencia':
    case 'municipioResidenciaId':
      return p
    case 'dni':
      p.identificationDocument = { ...obj(p.identificationDocument), type: { id: 'Dni' }, id: v.toUpperCase() }
      return p
    case 'nombre':
      p.name = v
      return p
    case 'apellido1':
      p.surname = v
      return p
    case 'fechaNacimiento':
      p.birthDate = v
      return p
    case 'sexo':
      p.gender = { id: v === 'hombre' ? 'Male' : v === 'mujer' ? 'Female' : v }
      return p
    case 'estadoCivil':
      p.maritalStatus = { id: v }
      return p
    case 'telefono':
      p.phones = [{ number: v.replace(/\s/g, ''), primary: true }]
      return p
    case 'fechaCarnet':
      p.drivingLicenses = [{ type: { id: 'B' }, date: v, issuingZone: { id: 'Spain' } }]
      return p
    case 'email':
      // 🚨 Sin fixture: el portal solo confirma que `email` es un campo de la
      // persona (`docs/CODEOSCOPIC-API-PORTAL.md`, roles de hogar), no su forma
      // exacta. Se manda como STRING plano, coherente con esa doc — la
      // verificación de `completarPersonas` (releer + comparar) es la que
      // delata si el vendor esperaba otra cosa, en vez de darlo por bueno.
      p.email = v
      return p
  }
}

/** Lee el campo tal y como está en la persona del proyecto. `null` = no está. */
export function leerCampoPersona(persona: unknown, campo: CampoPersona): string | null {
  const p = obj(persona)
  const d0 = obj(arr(p.addresses)[0])
  switch (campo) {
    case 'nombreVia':
      return str(d0.roadName)
    case 'numeroVia':
      return str(d0.roadNumber)
    case 'tipoVia': {
      const id = obj(d0.roadType).id
      return typeof id === 'number' ? String(id) : str(id)
    }
    case 'cpResidencia':
      return str(d0.postalCode)
    case 'municipioResidenciaId': {
      const id = obj(d0.town).id
      return typeof id === 'number' ? String(id) : str(id)
    }
    case 'dni':
      return str(obj(p.identificationDocument).id)
    case 'nombre':
      return str(p.name)
    case 'apellido1':
      return str(p.surname)
    case 'fechaNacimiento':
      return str(p.birthDate)
    case 'sexo':
      return str(obj(p.gender).id)
    case 'estadoCivil':
      return str(obj(p.maritalStatus).id)
    case 'telefono':
      return str(obj(arr(p.phones)[0]).number)
    case 'fechaCarnet':
      return str(obj(arr(p.drivingLicenses)[0]).date)
    case 'email':
      return str(p.email)
  }
}

/** Normaliza para comparar lo escrito con lo leído (el vendor puede cambiar mayúsculas/espacios). */
export function mismoValor(campo: CampoPersona, escrito: string, leido: string | null): boolean {
  if (leido === null) return false
  const n = (s: string) => s.replace(/\s+/g, ' ').trim().toUpperCase()
  if (campo === 'sexo') {
    const esperado = escrito === 'hombre' ? 'MALE' : escrito === 'mujer' ? 'FEMALE' : n(escrito)
    return n(leido) === esperado
  }
  if (campo === 'telefono') return leido.replace(/\s/g, '') === escrito.replace(/\s/g, '')
  return n(leido) === n(escrito)
}
