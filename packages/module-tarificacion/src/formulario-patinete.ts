// Formulario CANÓNICO de PATINETE / VMP (vehículo de movilidad personal) (03/11/2026). PURO: ni BD, ni red, ni Playwright.
//
// Lo que un robot necesita para TARIFICAR un patinete en un portal de compañía. Primera compañía: Allianz ePAC «Movilidad
// Personal» (servlet `/drvp00/`, pantallas «Figuras Intervinientes» y «Riesgo VMP», vistas en las exploraciones IA del 28-31/10/2026).
// Spec: docs/superpowers/specs/2026-11-03-solicitud-web-patinete.md (§1).
//
// Correspondencia con el riesgo libre de la oportunidad (`datos-riesgo-libre.ts` de module-seguros, ramo `patinete`):
//   marca → vmp.marca · modelo → vmp.modelo · certificadoVmp (certificado de circulación) → vmp.homologado · uso → vmp.usoProfesional
//   (quien encola traduce «profesional/reparto» a `true`). El CP y la fecha de nacimiento salen de la ficha / del formulario web.
//
// 🚨 Reglas de la casa:
//   · Tres estados: `null`/ausente = «no consta». Aquí NO hay valores por defecto en lo que decide la tarifa o es una declaración
//     al asegurador: uso (profesional o no), homologado y «velocidad limitada a 25 km/h» son EXPLÍCITOS.
//   · Fail-closed (spec §1): uso PROFESIONAL, NO homologado o «velocidad no confirmada» no se tarifican solos → error y a Alberto.
//   · La matrícula no existe en un VMP (nº de inscripción DGT, opcional): nunca se inventa.
//   · El documento y la fecha de nacimiento son datos PERSONALES: solo viven aquí y en su campo del portal; los errores nombran
//     el campo, nunca el valor.
import { esDniNie, normalizarDocumento } from './tomador.ts'
import { tieneCaracteresProhibidos } from './poblacion.ts'

export type DatosVmp = {
  /** Marca tal como la ve el cliente (catálogo `vmp_catalogo`); el bot la casa EXACTA contra el desplegable del portal. */
  marca: string
  modelo: string
  /** Uso profesional/reparto. `true` no se tarifica (a Alberto): el validador lo rechaza. Explícito. */
  usoProfesional: boolean
  /** ¿Homologado por la DGT / con certificado de circulación? Solo `true` se tarifica. Explícito. */
  homologado: boolean
  /**
   * Confirmación expresa de que la velocidad máxima está limitada a 25 km/h (casilla del portal). Es una DECLARACIÓN al asegurador sobre
   * el vehículo del cliente: solo `true` explícito (viene de una pregunta del formulario), nunca supuesta por el bot.
   */
  velocidadLimitada25: boolean
}

export type FormularioPatinete = {
  ramo: 'patinete'
  vmp: DatosVmp
  /** 5 dígitos, provincia 01-52. */
  codigoPostal: string
  /** Población esperada del CP (la que casa el portal en «Selección de Municipio»). `null` = no consta: se acepta la única que ofrezca el portal. */
  poblacion: string | null
  /** Conductor habitual (= tomador = propietario, spec §1). */
  conductor: { fechaNacimiento: string }
  /** Tomador. DNI/NIE: lo pone ASEGURA al entregar el trabajo (ficha) o, mientras Alberto lo autorice, el del mediador (spec, pregunta 1). */
  tomador: { documentoIdentidad: string }
  /** Fecha de efecto ISO. `null`/ausente = la que propone el portal (se lee y se declara). */
  efecto?: string | null
}

export type ValidacionFormularioPatinete = { ok: true; formulario: FormularioPatinete } | { ok: false; errores: string[] }

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function fechaIsoReal(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const f = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return f.getUTCFullYear() === Number(m[1]) && f.getUTCMonth() === Number(m[2]) - 1 && f.getUTCDate() === Number(m[3])
}

function texto(v: unknown, campo: string, errores: string[], max: number, obligatorio: boolean): string | null {
  if (vacio(v)) {
    if (obligatorio) errores.push(`${campo}: obligatorio`)
    return null
  }
  if (typeof v !== 'string') { errores.push(`${campo}: tiene que ser texto`); return null }
  const t = v.trim().replace(/\s+/g, ' ')
  if (t.length > max) { errores.push(`${campo}: más de ${max} caracteres`); return null }
  if (tieneCaracteresProhibidos(t)) { errores.push(`${campo}: caracteres no admitidos`); return null }
  return t
}

/** Booleano EXPLÍCITO: ausente o de otro tipo es error (sin valor por defecto). */
function booleanoExplicito(v: unknown, campo: string, errores: string[]): boolean | null {
  if (typeof v === 'boolean') return v
  errores.push(`${campo}: obligatorio, true o false explícito (sin valor por defecto)`)
  return null
}

/**
 * Riesgo crudo (de asegura) → `FormularioPatinete`, todo o nada. `hoy` fija la edad del conductor. Rechaza (fail-closed) el uso
 * profesional, lo no homologado y la velocidad no confirmada: esas solicitudes las atiende Alberto a mano.
 */
export function validarFormularioPatinete(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioPatinete {
  const errores: string[] = []
  const raiz = obj(entrada)
  if (!raiz) return { ok: false, errores: ['el riesgo de patinete tiene que ser un objeto'] }
  if (raiz.ramo !== 'patinete') errores.push('ramo: tiene que ser «patinete»')

  const vmp = obj(raiz.vmp)
  if (!vmp) errores.push('vmp: obligatorio')
  const marca = texto(vmp?.marca, 'vmp.marca', errores, 60, true)
  const modelo = texto(vmp?.modelo, 'vmp.modelo', errores, 80, true)
  const usoProfesional = booleanoExplicito(vmp?.usoProfesional, 'vmp.usoProfesional', errores)
  const homologado = booleanoExplicito(vmp?.homologado, 'vmp.homologado', errores)
  const velocidad = booleanoExplicito(vmp?.velocidadLimitada25, 'vmp.velocidadLimitada25', errores)
  if (usoProfesional === true) errores.push('vmp.usoProfesional: uso profesional/reparto no se tarifica solo (a Alberto)')
  if (homologado === false) errores.push('vmp.homologado: un patinete no homologado no se tarifica solo (a Alberto)')
  if (velocidad === false) errores.push('vmp.velocidadLimitada25: sin confirmar el límite de 25 km/h no se tarifica solo (a Alberto)')

  let codigoPostal: string | null = null
  if (vacio(raiz.codigoPostal)) errores.push('codigoPostal: obligatorio')
  else if (typeof raiz.codigoPostal !== 'string' || !/^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/.test(raiz.codigoPostal.trim())) errores.push('codigoPostal: 5 dígitos con provincia 01-52')
  else codigoPostal = raiz.codigoPostal.trim()
  const poblacion = texto(raiz.poblacion, 'poblacion', errores, 80, false)

  const conductor = obj(raiz.conductor)
  let fechaNacimiento: string | null = null
  const fn = conductor?.fechaNacimiento
  if (vacio(fn)) errores.push('conductor.fechaNacimiento: obligatorio')
  else if (typeof fn !== 'string' || !fechaIsoReal(fn)) errores.push('conductor.fechaNacimiento: fecha ISO AAAA-MM-DD real')
  else {
    const f = new Date(`${fn}T00:00:00Z`)
    let edad = hoy.getUTCFullYear() - f.getUTCFullYear()
    if (hoy.getUTCMonth() < f.getUTCMonth() || (hoy.getUTCMonth() === f.getUTCMonth() && hoy.getUTCDate() < f.getUTCDate())) edad--
    if (edad < 16 || edad > 99) errores.push('conductor.fechaNacimiento: edad fuera de 16-99 años')
    else fechaNacimiento = fn
  }

  const tomador = obj(raiz.tomador)
  let documento: string | null = null
  const doc = tomador?.documentoIdentidad
  if (vacio(doc)) errores.push('tomador.documentoIdentidad: obligatorio')
  else if (typeof doc !== 'string' || !esDniNie(doc)) errores.push('tomador.documentoIdentidad: DNI/NIE con letra de control correcta')
  else documento = normalizarDocumento(doc)

  let efecto: string | null = null
  if (!vacio(raiz.efecto)) {
    if (typeof raiz.efecto !== 'string' || !fechaIsoReal(raiz.efecto)) errores.push('efecto: fecha ISO AAAA-MM-DD real')
    else efecto = raiz.efecto
  }

  if (errores.length || !marca || !modelo || usoProfesional === null || homologado === null || velocidad === null || !codigoPostal || !fechaNacimiento || !documento) {
    return { ok: false, errores: errores.length ? errores : ['riesgo de patinete incompleto'] }
  }
  return {
    ok: true,
    formulario: {
      ramo: 'patinete',
      vmp: { marca, modelo, usoProfesional, homologado, velocidadLimitada25: velocidad },
      codigoPostal,
      poblacion,
      conductor: { fechaNacimiento },
      tomador: { documentoIdentidad: documento },
      efecto,
    },
  }
}
