// Formulario CANÓNICO de Comercio / Negocio (multirriesgo de comercio) (08/10/2026). PURO: ni BD, ni red.
//
// Datos de riesgo comunes del mercado español. Todavía no hay ninguna compañía registrada (la primera:
// Allianz ePAC «Calcula el seguro de tu Negocio», ramo interno 2038 subramo 0002, portal sin grabar):
// este ramo existe solo a nivel canónico y NO está en `RamoRpa`.
// Importes en EUROS como número (misma convención que `riesgo.ts` y las fichas), redondeados a céntimos.
//
// 🚨 Tres estados: `null` = «no consta», nunca 0/false. `0` empleados o `0` existencias son DATOS.
import { normalizarCnae } from './formulario-rc.ts'

export const REGIMENES_LOCAL = ['propiedad', 'alquiler'] as const
export type RegimenLocal = (typeof REGIMENES_LOCAL)[number]

export type FormularioComercio = {
  ramo: 'comercio'
  /** CNAE-2009 de 4 dígitos. Al menos uno de `cnae` / `actividadDescripcion`. */
  cnae: string | null
  actividadDescripcion: string | null
  regimen: RegimenLocal
  /** Dirección del riesgo: CP (5 dígitos, provincia 01-52) obligatorio; el resto, `null` = no consta. */
  codigoPostal: string
  poblacion: string | null
  direccion: string | null
  superficieM2: number
  anioConstruccion: number | null
  /** Edificio. Obligatorio si es propietario; en alquiler `null` = no se asegura (o no consta). */
  capitalContinenteEur: number | null
  /** Mobiliario, instalaciones y maquinaria. */
  capitalContenidoEur: number | null
  /** Mercancías. `0` = no hay existencias (dato); `null` = no consta. */
  capitalExistenciasEur: number | null
  tieneEscaparates: boolean | null
  tieneRotulos: boolean | null
  alarmaConectada: boolean | null
  rejasOCierreMetalico: boolean | null
  /** Límite de RC explotación que quiere; `null` = no consta / sin elegir. */
  limiteRcExplotacionEur: number | null
  numEmpleados: number
  facturacionAnualEur: number | null
}

export type ValidacionFormularioComercio = { ok: true; formulario: FormularioComercio } | { ok: false; errores: string[] }

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function texto(v: unknown, campo: string, errores: string[], max = 300): string | null {
  if (vacio(v)) return null
  if (typeof v !== 'string') { errores.push(`${campo}: tiene que ser texto`); return null }
  return v.trim().slice(0, max)
}

/** Importe en euros (número, no texto). `permitirCero`: 0 es un dato válido (p. ej. sin existencias). */
function importe(v: unknown, campo: string, errores: string[], permitirCero = false): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < 0 || (n === 0 && !permitirCero)) {
    errores.push(`${campo}: tiene que ser un importe en euros ${permitirCero ? 'no negativo' : 'mayor que 0'} (número, no texto)`)
    return null
  }
  return Math.round(n * 100) / 100
}

function entero(v: unknown, campo: string, errores: string[], min: number, max: number): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isInteger(n) || n < min || n > max) { errores.push(`${campo}: «${String(v)}» no es un entero entre ${min} y ${max}`); return null }
  return n
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'boolean') { errores.push(`${campo}: tiene que ser true/false (o no venir)`); return null }
  return v
}

export function validarFormularioComercio(entrada: unknown, hoy: Date = new Date()): ValidacionFormularioComercio {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return { ok: false, errores: ['el formulario tiene que ser un objeto'] }
  const e = entrada as Record<string, unknown>
  const errores: string[] = []

  const cnaeCrudo = texto(e.cnae, 'cnae', errores, 20)
  let cnae: string | null = null
  if (cnaeCrudo !== null) {
    cnae = normalizarCnae(cnaeCrudo)
    if (cnae === null) errores.push(`cnae: «${cnaeCrudo}» no es un CNAE de 4 dígitos`)
  }
  const actividadDescripcion = texto(e.actividadDescripcion, 'actividadDescripcion', errores)
  if (cnaeCrudo === null && actividadDescripcion === null) errores.push('actividad: indica el CNAE o describe la actividad')

  let regimen: RegimenLocal | null = null
  if (vacio(e.regimen)) errores.push('regimen: obligatorio (propiedad o alquiler)')
  else if (typeof e.regimen === 'string' && (REGIMENES_LOCAL as readonly string[]).includes(e.regimen)) regimen = e.regimen as RegimenLocal
  else errores.push(`regimen: «${String(e.regimen)}» no es uno de ${REGIMENES_LOCAL.join(', ')}`)

  let codigoPostal: string | null = null
  if (vacio(e.codigoPostal)) errores.push('codigoPostal: obligatorio')
  else {
    const cp = typeof e.codigoPostal === 'number' ? String(e.codigoPostal).padStart(5, '0') : typeof e.codigoPostal === 'string' ? e.codigoPostal.trim() : ''
    const prov = Number(cp.slice(0, 2))
    if (/^\d{5}$/.test(cp) && prov >= 1 && prov <= 52) codigoPostal = cp
    else errores.push(`codigoPostal: «${String(e.codigoPostal)}» no es un código postal español de 5 dígitos`)
  }
  const poblacion = texto(e.poblacion, 'poblacion', errores, 120)
  const direccion = texto(e.direccion, 'direccion', errores, 200)

  const superficie = importe(e.superficieM2, 'superficieM2', errores)
  if (superficie === null && vacio(e.superficieM2)) errores.push('superficieM2: obligatorio')
  if (superficie !== null && superficie > 100_000) errores.push('superficieM2: más de 100.000 m² no es un comercio')

  const anioConstruccion = entero(e.anioConstruccion, 'anioConstruccion', errores, 1500, hoy.getFullYear() + 1)

  const continente = importe(e.capitalContinenteEur, 'capitalContinenteEur', errores)
  const contenido = importe(e.capitalContenidoEur, 'capitalContenidoEur', errores)
  const existencias = importe(e.capitalExistenciasEur, 'capitalExistenciasEur', errores, true)
  // Propietario sin continente: no se adivina (¿lo asegura la comunidad? ¿se olvidó?). Se pide explícito.
  if (regimen === 'propiedad' && continente === null && !errores.some((x) => x.startsWith('capitalContinenteEur'))) {
    errores.push('capitalContinenteEur: obligatorio si el local es en propiedad')
  }
  if (continente === null && contenido === null && !(existencias !== null && existencias > 0) && !errores.some((x) => x.startsWith('capital'))) {
    errores.push('capitales: indica al menos continente, contenido o existencias')
  }

  const tieneEscaparates = booleano(e.tieneEscaparates, 'tieneEscaparates', errores)
  const tieneRotulos = booleano(e.tieneRotulos, 'tieneRotulos', errores)
  const alarmaConectada = booleano(e.alarmaConectada, 'alarmaConectada', errores)
  const rejasOCierreMetalico = booleano(e.rejasOCierreMetalico, 'rejasOCierreMetalico', errores)

  const limiteRc = importe(e.limiteRcExplotacionEur, 'limiteRcExplotacionEur', errores)
  const empleados = entero(e.numEmpleados, 'numEmpleados', errores, 0, 100_000)
  if (empleados === null && vacio(e.numEmpleados)) errores.push('numEmpleados: obligatorio (0 si no hay empleados)')
  const facturacion = importe(e.facturacionAnualEur, 'facturacionAnualEur', errores)

  if (errores.length || regimen === null || codigoPostal === null || superficie === null || empleados === null) return { ok: false, errores }
  return {
    ok: true,
    formulario: {
      ramo: 'comercio',
      cnae,
      actividadDescripcion,
      regimen,
      codigoPostal,
      poblacion,
      direccion,
      superficieM2: superficie,
      anioConstruccion,
      capitalContinenteEur: continente,
      capitalContenidoEur: contenido,
      capitalExistenciasEur: existencias,
      tieneEscaparates,
      tieneRotulos,
      alarmaConectada,
      rejasOCierreMetalico,
      limiteRcExplotacionEur: limiteRc,
      numEmpleados: empleados,
      facturacionAnualEur: facturacion,
    },
  }
}
