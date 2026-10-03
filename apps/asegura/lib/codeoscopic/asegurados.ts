// Asegurados ADICIONALES de salud y decesos (`risk.insureds[]`). PURO.
//
// `HealthRisk_V1` y `BurialRisk_V1` documentan `insureds` (obligatorio) como un
// array de `NaturalPerson_V1` a secas: «sin parentesco, sin rol propio, sin
// capital por persona en el esquema» (`docs/CODEOSCOPIC-API-PORTAL.md`). El
// primero es el tomador; los demás los teclea el corredor.
//
// De cada uno solo se manda lo que la pantalla recoge y el esquema documenta:
// nombre, apellidos, fecha de nacimiento, sexo y —opcional— documento. Qué más
// exige el vendor para un asegurado lo dice `person-roles` (`roles-persona.ts`):
// lo que pida y aquí no exista sale como dato que falta, nunca se inventa.

import {
  documentoEspanolInvalido,
  normalizarDocumento,
  RE_FECHA,
  texto,
  tipoDocumento,
} from './persona.ts'

export type AseguradoAdicional = {
  nombre: string
  apellido1: string
  apellido2?: string | null
  fechaNacimiento: string // aaaa-mm-dd
  sexo: 'hombre' | 'mujer'
  /** Opcional: solo viaja si se da. El rol del vendor puede exigirlo (`roles-persona.ts`). */
  dni?: string | null
  /** ISO alpha-3. Obligatoria con NIE o pasaporte (misma regla que el tomador). */
  nacionalidad?: string | null
}

/** Tope de cordura contra un cuerpo absurdo; el máximo REAL lo dice `max` del rol en `person-roles`. */
export const MAX_ADICIONALES_CORDURA = 20

/**
 * Valida la lista de adicionales ANTES de leerla: tiene que ser un array de objetos y no pasar del
 * tope. `null`/`undefined` = «no hay adicionales» (se valida con `obligatorio: false`); en una
 * corrección explícita `null` es un error. Devuelve el mensaje de validación (422) o `null` si vale.
 * Nada se descarta en silencio: lo que sobra se rechaza.
 */
export function errorAseguradosAdicionales(v: unknown, donde = 'asegurados adicionales'): string | null {
  if (v === undefined || v === null) return null
  if (!Array.isArray(v)) return `${donde}: tiene que ser una lista de personas`
  if (v.length > MAX_ADICIONALES_CORDURA) return `${donde}: máximo ${MAX_ADICIONALES_CORDURA} asegurados adicionales (llegaron ${v.length}); no se descarta ninguno en silencio`
  const i = v.findIndex((x) => typeof x !== 'object' || x === null || Array.isArray(x))
  return i >= 0 ? `${donde}: el elemento ${i + 1} no es un objeto con los datos del asegurado` : null
}

/**
 * `resueltos.asegurados` (lo que manda la pantalla) y `correcciones.aseguradosAdicionales` (lo que
 * pisa lo supuesto): ambos tienen que ser una lista de objetos con tope. En la corrección, `null` o
 * un tipo equivocado se RECHAZA (no se ignora): llegaría a `revisarAseguradosAdicionales` y daría 500.
 */
export function errorAseguradosEnCuerpo(resueltos: unknown, correcciones: unknown): string | null {
  const r = errorAseguradosAdicionales((resueltos as { asegurados?: unknown } | null)?.asegurados, 'asegurados')
  if (r) return r
  if (correcciones && typeof correcciones === 'object' && !Array.isArray(correcciones) && 'aseguradosAdicionales' in correcciones) {
    const v = (correcciones as Record<string, unknown>).aseguradosAdicionales
    if (v === null || v === undefined) return 'correcciones.aseguradosAdicionales: tiene que ser una lista (para quitar adicionales manda [])'
    return errorAseguradosAdicionales(v, 'correcciones.aseguradosAdicionales')
  }
  return null
}

function limpio(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * Lee la lista que llega del cuerpo (`resueltos.asegurados`). Una entrada que no es
 * un objeto se descarta; los campos mal tipados quedan vacíos y `revisarAsegurado`
 * los reclama. `undefined`/`null` → lista vacía (no hay adicionales).
 */
export function leerAseguradosAdicionales(v: unknown): AseguradoAdicional[] {
  if (!Array.isArray(v)) return []
  const out: AseguradoAdicional[] = []
  for (const x of v.slice(0, MAX_ADICIONALES_CORDURA)) {
    if (typeof x !== 'object' || x === null || Array.isArray(x)) continue
    const o = x as Record<string, unknown>
    out.push({
      nombre: limpio(o.nombre) ?? '',
      apellido1: limpio(o.apellido1) ?? '',
      apellido2: limpio(o.apellido2),
      fechaNacimiento: limpio(o.fechaNacimiento) ?? '',
      sexo: o.sexo === 'hombre' || o.sexo === 'mujer' ? o.sexo : ('' as never),
      dni: limpio(o.dni),
      nacionalidad: limpio(o.nacionalidad),
    })
  }
  return out
}

/** Lo que falta o está mal en UN asegurado adicional (vacío = se puede mandar). */
export function revisarAsegurado(a: Partial<AseguradoAdicional>): { campo: keyof AseguradoAdicional; motivo: string }[] {
  const r: { campo: keyof AseguradoAdicional; motivo: string }[] = []
  const falta = (campo: keyof AseguradoAdicional, motivo = 'hace falta') => r.push({ campo, motivo })
  if (!texto(a.nombre)) falta('nombre')
  if (!texto(a.apellido1)) falta('apellido1', 'hace falta el primer apellido')
  if (!texto(a.fechaNacimiento)) falta('fechaNacimiento', 'hace falta la fecha de nacimiento')
  else if (!RE_FECHA.test(String(a.fechaNacimiento))) r.push({ campo: 'fechaNacimiento', motivo: 'la fecha tiene que ser aaaa-mm-dd' })
  if (a.sexo !== 'hombre' && a.sexo !== 'mujer') falta('sexo')
  if (texto(a.dni)) {
    if (documentoEspanolInvalido(a.dni)) r.push({ campo: 'dni', motivo: 'la letra del DNI/NIE no es correcta: revisa el documento' })
    const tipo = tipoDocumento(a.dni)
    if (tipo === 'Dni' && !texto(a.apellido2)) falta('apellido2', 'el segundo apellido es obligatorio con DNI para el vendor')
    if (tipo !== 'Dni' && !texto(a.nacionalidad)) falta('nacionalidad', 'la nacionalidad (código ISO de 3 letras) es obligatoria con NIE o pasaporte')
    else if (tipo !== 'Dni' && !/^[A-Za-z]{3}$/.test(String(a.nacionalidad).trim()))
      r.push({ campo: 'nacionalidad', motivo: 'tiene que ser el código ISO de 3 letras (p. ej. ESP, MAR)' })
  }
  return r
}

/** Todos los reparos de la lista, en una frase por asegurado («asegurado 2: …»). */
export function revisarAseguradosAdicionales(lista: readonly Partial<AseguradoAdicional>[]): string[] {
  return lista.flatMap((a, i) => {
    const rs = revisarAsegurado(a)
    return rs.length === 0 ? [] : [`asegurado adicional ${i + 1}: ${rs.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`]
  })
}

/** `NaturalPerson_V1` de un asegurado adicional. Lanza si no pasa `revisarAsegurado`. */
export function construirAsegurado(a: AseguradoAdicional): Record<string, unknown> {
  const reparos = revisarAsegurado(a)
  if (reparos.length > 0) {
    throw new Error(`codeoscopic_datos_incompletos: asegurado ${reparos.map((x) => `${x.campo} (${x.motivo})`).join(' · ')}`)
  }
  const p: Record<string, unknown> = {
    name: a.nombre.trim(),
    surname: a.apellido1.trim(),
    birthDate: a.fechaNacimiento,
    gender: { id: a.sexo === 'hombre' ? 'Male' : 'Female' },
  }
  if (texto(a.apellido2)) p.surname2 = a.apellido2!.trim()
  if (texto(a.dni)) {
    p.identificationDocument = { type: { id: tipoDocumento(a.dni) }, id: normalizarDocumento(a.dni) }
    if (tipoDocumento(a.dni) !== 'Dni' && texto(a.nacionalidad)) p.nationality = { code: a.nacionalidad!.trim().toUpperCase() }
  }
  return p
}
