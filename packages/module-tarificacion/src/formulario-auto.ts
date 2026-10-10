// Formulario CANÓNICO de AUTO (turismo) / MOTO (10/10/2026). PURO: ni BD, ni red.
//
// Lo que un robot necesita para cotizar un vehículo en un portal de compañía. La ficha del vehículo NO va aquí: la
// rellena el robot con la consulta por matrícula del propio portal (`vehiculo.ts`). Solo la `eleccionVersion` (código de
// catálogo o etiqueta exacta) que una persona escoge en la bandeja cuando el catálogo ofrece varias.
// Ramo sin compañía registrada: el primer robot (Allianz ePAC Autos) está en construcción e INACTIVO.
//
// 🚨 Tres estados: `null` = «no consta», nunca 0/false. 0 siniestros es un DATO. La matrícula es dato personal: solo
// vive aquí y en el campo del portal; nunca en logs, trazas ni mensajes.
import { esMatriculaEspanola, normalizarMatricula, type EleccionVersion } from './vehiculo.ts'
import { validarTomador, type Tomador } from './tomador.ts'

export const RAMOS_VEHICULO = ['auto', 'moto'] as const
export type RamoVehiculo = (typeof RAMOS_VEHICULO)[number]
export const SEXOS_CONDUCTOR = ['hombre', 'mujer'] as const
export type SexoConductor = (typeof SEXOS_CONDUCTOR)[number]

export type ConductorHabitual = {
  /** ISO AAAA-MM-DD. */
  fechaNacimiento: string
  /** Fecha del carné (ISO). */
  fechaCarne: string
  /** `null` = no consta (algunos portales lo piden; el robot no lo inventa). */
  sexo: SexoConductor | null
}

export type FormularioAuto = {
  ramo: RamoVehiculo
  /** Normalizada (sin espacios ni guiones). */
  matricula: string
  /** CP de circulación/pernocta (5 dígitos, provincia 01-52). */
  codigoPostal: string
  conductor: ConductorHabitual
  /** ¿Tomador = conductor habitual = propietario? `null` = no consta. */
  tomadorEsConductor: boolean | null
  tomadorEsPropietario: boolean | null
  /** Años asegurado en la compañía anterior y siniestros con culpa en los últimos 5 años. `null` = no consta. */
  aniosAseguradoAnterior: number | null
  siniestrosUltimos5Anios: number | null
  garajeNoche: boolean | null
  tomador?: Tomador | null
  /** Elección de versión hecha por una persona (bandeja). Ausente = el robot no elige si hay varias. */
  eleccionVersion?: EleccionVersion | null
}

export type ValidacionFormularioAuto = { ok: true; formulario: FormularioAuto } | { ok: false; errores: string[] }

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function fechaIso(v: unknown, campo: string, errores: string[]): string | null {
  if (vacio(v)) return null
  const s = typeof v === 'string' ? v.trim() : ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const f = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
  if (!m || !f || f.toISOString().slice(0, 10) !== s) {
    errores.push(`${campo}: tiene que ser una fecha AAAA-MM-DD`)
    return null
  }
  return s
}

function entero(v: unknown, campo: string, errores: string[], min: number, max: number): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isInteger(n) || n < min || n > max) {
    errores.push(`${campo}: tiene que ser un entero entre ${min} y ${max}`)
    return null
  }
  return n
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'boolean') {
    errores.push(`${campo}: tiene que ser true/false (o no venir)`)
    return null
  }
  return v
}

const edad = (iso: string, hoy: Date) => {
  const [a, m, d] = iso.split('-').map(Number)
  let e = hoy.getUTCFullYear() - a
  if (hoy.getUTCMonth() + 1 < m || (hoy.getUTCMonth() + 1 === m && hoy.getUTCDate() < d)) e--
  return e
}

export function validarFormularioAuto(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioAuto {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return { ok: false, errores: ['el formulario tiene que ser un objeto'] }
  const e = entrada as Record<string, unknown>
  const errores: string[] = []

  let ramo: RamoVehiculo | null = null
  if (typeof e.ramo === 'string' && (RAMOS_VEHICULO as readonly string[]).includes(e.ramo)) ramo = e.ramo as RamoVehiculo
  else errores.push(`ramo: tiene que ser uno de ${RAMOS_VEHICULO.join(', ')}`)

  // Nunca se repite el valor en el error: es dato personal.
  let matricula: string | null = null
  if (vacio(e.matricula)) errores.push('matricula: obligatoria (el robot consulta el vehículo con ella)')
  else if (typeof e.matricula !== 'string' || !esMatriculaEspanola(e.matricula)) errores.push('matricula: no tiene formato de matrícula española')
  else matricula = normalizarMatricula(e.matricula)

  let codigoPostal: string | null = null
  const cp = typeof e.codigoPostal === 'string' ? e.codigoPostal.trim() : ''
  const prov = Number(cp.slice(0, 2))
  if (/^\d{5}$/.test(cp) && prov >= 1 && prov <= 52) codigoPostal = cp
  else errores.push('codigoPostal: obligatorio, 5 dígitos de un código postal español')

  let conductor: ConductorHabitual | null = null
  const c = e.conductor
  if (typeof c !== 'object' || c === null || Array.isArray(c)) errores.push('conductor: obligatorio (fecha de nacimiento y del carné)')
  else {
    const cc = c as Record<string, unknown>
    const nac = fechaIso(cc.fechaNacimiento, 'conductor.fechaNacimiento', errores)
    const carne = fechaIso(cc.fechaCarne, 'conductor.fechaCarne', errores)
    if (vacio(cc.fechaNacimiento)) errores.push('conductor.fechaNacimiento: obligatoria')
    if (vacio(cc.fechaCarne)) errores.push('conductor.fechaCarne: obligatoria')
    let sexo: SexoConductor | null = null
    if (!vacio(cc.sexo)) {
      if (typeof cc.sexo === 'string' && (SEXOS_CONDUCTOR as readonly string[]).includes(cc.sexo)) sexo = cc.sexo as SexoConductor
      else errores.push(`conductor.sexo: tiene que ser uno de ${SEXOS_CONDUCTOR.join(', ')} (o no venir)`)
    }
    if (nac && carne) {
      if (edad(nac, hoy) < 14 || edad(nac, hoy) > 110) errores.push('conductor.fechaNacimiento: edad fuera de rango (14-110)')
      if (carne <= nac) errores.push('conductor.fechaCarne: no puede ser anterior al nacimiento')
      if (carne > hoy.toISOString().slice(0, 10)) errores.push('conductor.fechaCarne: no puede ser futura')
    }
    if (nac && carne) conductor = { fechaNacimiento: nac, fechaCarne: carne, sexo }
  }

  const tomadorEsConductor = booleano(e.tomadorEsConductor, 'tomadorEsConductor', errores)
  const tomadorEsPropietario = booleano(e.tomadorEsPropietario, 'tomadorEsPropietario', errores)
  const aniosAseguradoAnterior = entero(e.aniosAseguradoAnterior, 'aniosAseguradoAnterior', errores, 0, 80)
  const siniestrosUltimos5Anios = entero(e.siniestrosUltimos5Anios, 'siniestrosUltimos5Anios', errores, 0, 50)
  const garajeNoche = booleano(e.garajeNoche, 'garajeNoche', errores)

  let tomador: Tomador | null = null
  if (!vacio(e.tomador)) {
    const t = validarTomador(e.tomador, hoy)
    if (t.ok) tomador = t.tomador
    else errores.push(...t.errores)
  }

  let eleccionVersion: EleccionVersion | null = null
  if (!vacio(e.eleccionVersion)) {
    const ev = e.eleccionVersion as Record<string, unknown>
    const codigo = typeof ev?.codigo === 'string' && ev.codigo.trim() ? ev.codigo.trim().slice(0, 60) : null
    const etiqueta = typeof ev?.etiqueta === 'string' && ev.etiqueta.trim() ? ev.etiqueta.trim().slice(0, 200) : null
    if (codigo === null && etiqueta === null) errores.push('eleccionVersion: trae un código o una etiqueta, o no venga')
    else eleccionVersion = { codigo, etiqueta }
  }

  if (errores.length || !ramo || !matricula || !codigoPostal || !conductor) return { ok: false, errores }
  return {
    ok: true,
    formulario: { ramo, matricula, codigoPostal, conductor, tomadorEsConductor, tomadorEsPropietario, aniosAseguradoAnterior, siniestrosUltimos5Anios, garajeNoche, tomador, eleccionVersion },
  }
}
