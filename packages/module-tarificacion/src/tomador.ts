// Bloque canónico del TOMADOR (08/10/2026). PURO: ni BD, ni red. Reutilizable por los formularios canónicos
// (hoy `formulario-comercio.ts`; Comunidades conserva sus `documentoIdentidad`/`tipoDocumento` sueltos en `riesgo.ts`).
//
// Persona física: nombre + primer apellido + documento (DNI/NIE) + fecha de nacimiento.
// Persona jurídica: razón social + documento (CIF). La fecha de nacimiento solo existe en la física.
// Teléfono y email son opcionales. `null` = «no consta», nunca un valor por defecto.
// Los validadores NO inventan nada: un documento con la letra de control mal es un error, no se «corrige».

export const TIPOS_TOMADOR = ['fisica', 'juridica'] as const
export type TipoTomador = (typeof TIPOS_TOMADOR)[number]

export type Tomador = {
  tipo: TipoTomador
  /** Física: obligatorio. Jurídica: `null`. */
  nombre: string | null
  apellido1: string | null
  apellido2: string | null
  /** Jurídica: obligatorio. Física: `null`. */
  razonSocial: string | null
  /** DNI/NIE (física) o CIF (jurídica), normalizado: mayúsculas, sin espacios ni guiones. */
  documentoIdentidad: string
  /** ISO AAAA-MM-DD. Solo física. */
  fechaNacimiento: string | null
  codigoPostal: string | null
  poblacion: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
}

export type ValidacionTomador = { ok: true; tomador: Tomador } | { ok: false; errores: string[] }

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function texto(v: unknown, campo: string, errores: string[], max = 200): string | null {
  if (vacio(v)) return null
  if (typeof v !== 'string') { errores.push(`${campo}: tiene que ser texto`); return null }
  return v.trim().replace(/\s+/g, ' ').slice(0, max)
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** Normaliza un documento: mayúsculas, sin espacios, puntos ni guiones. */
export function normalizarDocumento(d: string): string {
  return d.toUpperCase().replace(/[\s.\-/]/g, '')
}

/** DNI (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra) con la letra de control correcta. */
export function esDniNie(doc: string): boolean {
  const d = normalizarDocumento(doc)
  let m = /^(\d{8})([A-Z])$/.exec(d)
  if (m) return LETRAS_DNI[Number(m[1]) % 23] === m[2]
  m = /^([XYZ])(\d{7})([A-Z])$/.exec(d)
  if (m) return LETRAS_DNI[Number(`${'XYZ'.indexOf(m[1])}${m[2]}`) % 23] === m[3]
  return false
}

/** CIF (letra + 7 dígitos + control dígito/letra según el tipo de entidad). */
export function esCif(doc: string): boolean {
  const d = normalizarDocumento(doc)
  const m = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(d)
  if (!m) return false
  const dig = m[2].split('').map(Number)
  const pares = dig[1] + dig[3] + dig[5]
  const impares = [dig[0], dig[2], dig[4], dig[6]].reduce((s, x) => s + Math.floor((x * 2) / 10) + ((x * 2) % 10), 0)
  const control = (10 - ((pares + impares) % 10)) % 10
  const letra = 'JABCDEFGHI'[control]
  if ('KPQRSNW'.includes(m[1])) return m[3] === letra
  if ('ABEH'.includes(m[1])) return m[3] === String(control)
  return m[3] === String(control) || m[3] === letra
}

/** Fecha ISO real (no 31/02) → `true`. */
function fechaIsoReal(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return f.getUTCFullYear() === Number(m[1]) && f.getUTCMonth() === Number(m[2]) - 1 && f.getUTCDate() === Number(m[3])
}

/** Teléfono español: 9 dígitos que empiezan por 6-9 (admite +34/0034 y separadores). */
export function normalizarTelefono(t: string): string | null {
  const s = t.replace(/[\s.\-()]/g, '').replace(/^(\+34|0034)/, '')
  return /^[6-9]\d{8}$/.test(s) ? s : null
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function validarTomador(entrada: unknown, hoy: Date = new Date(), prefijo = 'tomador'): ValidacionTomador {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return { ok: false, errores: [`${prefijo}: tiene que ser un objeto`] }
  const e = entrada as Record<string, unknown>
  const errores: string[] = []
  const c = (campo: string) => `${prefijo}.${campo}`

  let tipo: TipoTomador | null = null
  if (vacio(e.tipo)) errores.push(`${c('tipo')}: obligatorio (fisica o juridica)`)
  else if (typeof e.tipo === 'string' && (TIPOS_TOMADOR as readonly string[]).includes(e.tipo)) tipo = e.tipo as TipoTomador
  else errores.push(`${c('tipo')}: «${String(e.tipo)}» no es uno de ${TIPOS_TOMADOR.join(', ')}`)

  const nombre = texto(e.nombre, c('nombre'), errores, 100)
  const apellido1 = texto(e.apellido1, c('apellido1'), errores, 100)
  const apellido2 = texto(e.apellido2, c('apellido2'), errores, 100)
  const razonSocial = texto(e.razonSocial, c('razonSocial'), errores, 200)

  let documento: string | null = null
  const docCrudo = texto(e.documentoIdentidad, c('documentoIdentidad'), errores, 20)
  if (docCrudo === null) {
    if (!errores.some((x) => x.startsWith(c('documentoIdentidad')))) errores.push(`${c('documentoIdentidad')}: obligatorio`)
  } else documento = normalizarDocumento(docCrudo)

  let fechaNacimiento: string | null = null
  const fnCruda = texto(e.fechaNacimiento, c('fechaNacimiento'), errores, 10)

  if (tipo === 'fisica') {
    if (nombre === null) errores.push(`${c('nombre')}: obligatorio en persona física`)
    if (apellido1 === null) errores.push(`${c('apellido1')}: obligatorio en persona física`)
    if (razonSocial !== null) errores.push(`${c('razonSocial')}: solo en persona jurídica`)
    if (documento !== null && !esDniNie(documento)) errores.push(`${c('documentoIdentidad')}: «${documento}» no es un DNI/NIE válido`)
    if (fnCruda === null) errores.push(`${c('fechaNacimiento')}: obligatoria en persona física`)
    else if (!fechaIsoReal(fnCruda)) errores.push(`${c('fechaNacimiento')}: «${fnCruda}» no es una fecha AAAA-MM-DD`)
    else {
      const f = new Date(`${fnCruda}T00:00:00Z`)
      let edad = hoy.getUTCFullYear() - f.getUTCFullYear()
      if (hoy.getUTCMonth() < f.getUTCMonth() || (hoy.getUTCMonth() === f.getUTCMonth() && hoy.getUTCDate() < f.getUTCDate())) edad--
      if (edad < 18 || edad > 110) errores.push(`${c('fechaNacimiento')}: la edad resultante (${edad}) no es la de un tomador`)
      else fechaNacimiento = fnCruda
    }
  } else if (tipo === 'juridica') {
    if (razonSocial === null) errores.push(`${c('razonSocial')}: obligatoria en persona jurídica`)
    if (nombre !== null || apellido1 !== null || apellido2 !== null) errores.push(`${c('nombre')}: nombre y apellidos son solo de persona física`)
    if (documento !== null && !esCif(documento)) errores.push(`${c('documentoIdentidad')}: «${documento}» no es un CIF válido`)
    if (fnCruda !== null) errores.push(`${c('fechaNacimiento')}: solo existe en persona física`)
  }

  let codigoPostal: string | null = null
  if (!vacio(e.codigoPostal)) {
    const cp = typeof e.codigoPostal === 'number' ? String(e.codigoPostal).padStart(5, '0') : typeof e.codigoPostal === 'string' ? e.codigoPostal.trim() : ''
    const prov = Number(cp.slice(0, 2))
    if (/^\d{5}$/.test(cp) && prov >= 1 && prov <= 52) codigoPostal = cp
    else errores.push(`${c('codigoPostal')}: «${String(e.codigoPostal)}» no es un código postal español de 5 dígitos`)
  }
  const poblacion = texto(e.poblacion, c('poblacion'), errores, 120)
  const direccion = texto(e.direccion, c('direccion'), errores, 200)

  let telefono: string | null = null
  const telCrudo = texto(e.telefono, c('telefono'), errores, 30)
  if (telCrudo !== null) {
    telefono = normalizarTelefono(telCrudo)
    if (telefono === null) errores.push(`${c('telefono')}: «${telCrudo}» no es un teléfono español de 9 dígitos`)
  }
  let email: string | null = null
  const emCrudo = texto(e.email, c('email'), errores, 200)
  if (emCrudo !== null) {
    if (EMAIL.test(emCrudo)) email = emCrudo.toLowerCase()
    else errores.push(`${c('email')}: «${emCrudo}» no parece un correo`)
  }

  if (errores.length || tipo === null || documento === null) return { ok: false, errores }
  return {
    ok: true,
    tomador: { tipo, nombre, apellido1, apellido2, razonSocial, documentoIdentidad: documento, fechaNacimiento, codigoPostal, poblacion, direccion, telefono, email },
  }
}
