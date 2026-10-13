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
import { hoyEnMadrid } from './fecha-efecto.ts'

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

/** Edad máxima razonable de un asegurado (años cumplidos): por encima es un error de teclado, no una persona. */
export const EDAD_MAXIMA_ASEGURADO = 120

/**
 * PURA. Por qué una fecha `aaaa-mm-dd` (con forma ya válida) no puede ser un nacimiento: no existe en el calendario
 * (31/02), es futura (se compara con `hoy` en Madrid, que es como el vendor decide «hoy») o implica más de
 * `EDAD_MAXIMA_ASEGURADO` años. `null` = vale. Una fecha sin forma ISO devuelve `null`: eso ya lo dice el formato.
 * Sin esto el vendor responde 400 y la petición se cobra igualmente (0,50€).
 */
export function motivoFechaNacimientoImposible(f: string, hoy: string = hoyEnMadrid()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f)
  if (!m) return null
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(a, mes - 1, dia))
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia)
    return `la fecha de nacimiento ${f} no existe en el calendario`
  if (f > hoy) return `la fecha de nacimiento ${f} es futura`
  const [ah, mh, dh] = hoy.split('-').map(Number)
  const edad = ah - a - (mh < mes || (mh === mes && dh < dia) ? 1 : 0)
  if (edad > EDAD_MAXIMA_ASEGURADO) return `la fecha de nacimiento ${f} implica más de ${EDAD_MAXIMA_ASEGURADO} años`
  return null
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
  // Nunca se recorta en silencio: lo que pasa del tope es un error (los puntos de entrada ya lo cortan con 422
  // vía `errorAseguradosAdicionales`; esto es la red por si alguien llama sin validar antes).
  if (v.length > MAX_ADICIONALES_CORDURA) throw new Error(`asegurados adicionales: máximo ${MAX_ADICIONALES_CORDURA} (llegaron ${v.length}); no se descarta ninguno en silencio`)
  for (const x of v) {
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
  else {
    const imposible = motivoFechaNacimientoImposible(String(a.fechaNacimiento))
    if (imposible) r.push({ campo: 'fechaNacimiento', motivo: imposible })
  }
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

// ─── Asegurados que son FIGURAS del riesgo (decesos embebido, 13/10/2026) ──────
//
// En la pantalla del riesgo los asegurados de decesos son FICHAS (rol `asegurado` de `oportunidad_figura`), no texto.
// El servidor arma `risk.insureds[1..]` desde sus fichas: la pantalla nunca manda la lista (ni ve el DNI). Solo se
// mira lo que `NaturalPerson_V1` lleva de un asegurado (ver `construirAsegurado`): nombre, apellidos, nacimiento,
// sexo y, opcional, el documento. Teléfono, estado civil o dirección NO se piden a un asegurado: Avant2 no los lleva.

/** Lo que se lee de la ficha de un asegurado (`personaDeFicha`: persona física). */
export type FichaAsegurado = {
  nombre?: string | null
  apellido1?: string | null
  apellido2?: string | null
  fechaNacimiento?: string | null
  sexo?: 'hombre' | 'mujer' | null
  dni?: string | null
}

/**
 * PURA. El asegurado tal como viaja, desde su ficha. El documento solo viaja si es un DNI español: con NIE o pasaporte
 * el vendor exige además la nacionalidad, que la ficha NO guarda, y el documento es OPCIONAL en `NaturalPerson_V1`
 * (nunca se inventa la nacionalidad). Lo que falte lo dice `revisarAsegurado` (vacío = se puede mandar).
 */
export function aseguradoDeFicha(f: FichaAsegurado): AseguradoAdicional {
  const t = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  const dni = t(f.dni)
  return {
    nombre: t(f.nombre) ?? '',
    apellido1: t(f.apellido1) ?? '',
    apellido2: t(f.apellido2),
    fechaNacimiento: t(f.fechaNacimiento) ?? '',
    sexo: f.sexo === 'hombre' || f.sexo === 'mujer' ? f.sexo : ('' as never),
    dni: dni !== null && tipoDocumento(dni) === 'Dni' ? dni : null,
    nacionalidad: null,
  }
}

/** PURA. Qué le falta a la FICHA de un asegurado para viajar a Avant2 (claves de campo, sin repetir). `[]` = nada. */
export function faltanDeAseguradoFicha(f: FichaAsegurado): string[] {
  const nac = aseguradoDeFicha(f).fechaNacimiento
  // Fecha presente y con forma, pero imposible (31/02), futura o de >120 años: clave propia para decirlo claro.
  const imposible = RE_FECHA.test(nac) && motivoFechaNacimientoImposible(nac) !== null
  return [...new Set(revisarAsegurado(aseguradoDeFicha(f)).map((r) => (imposible && r.campo === 'fechaNacimiento' ? 'fechaNacimiento_invalida' : (r.campo as string))))]
}

/**
 * PURA. De las figuras `asegurado` de un riesgo de vida, la persona asegurada que NO es el tomador. Identidad por
 * `cliente_id` (ficha), nunca por posición: el tomador y los repetidos no cuentan. `ninguno` = el asegurado es el
 * tomador; `varios` = no cabe en `risk.insured` (Avant2 lleva UNA persona asegurada).
 */
export function aseguradoDistintoDelTomador(
  filas: Array<{ cliente_id: string }>,
  tomadorId: string,
): { tipo: 'ninguno' } | { tipo: 'uno'; clienteId: string } | { tipo: 'varios' } {
  const otros = [...new Set(filas.map((f) => f.cliente_id))].filter((id) => id !== tomadorId)
  if (otros.length === 0) return { tipo: 'ninguno' }
  return otros.length === 1 ? { tipo: 'uno', clienteId: otros[0] } : { tipo: 'varios' }
}
