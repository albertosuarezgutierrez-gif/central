// Formulario CANÓNICO de RC general / de actividad (08/10/2026). PURO: ni BD, ni red.
//
// Datos de riesgo comunes a cualquier compañía. Todavía no hay ninguna registrada (la primera: Occident,
// pendiente de grabar su portal): este ramo existe solo a nivel canónico y NO está en `RamoRpa`.
// Importes en EUROS como número (misma convención que `riesgo.ts` y las fichas), redondeados a céntimos.
//
// 🚨 Tres estados: `null` = «no consta», nunca 0/false. `0` empleados o `0` siniestros son DATOS.

export const AMBITOS_TERRITORIALES_RC = ['espana', 'union_europea', 'mundo_excl_eeuu_canada', 'mundo'] as const
export type AmbitoTerritorialRc = (typeof AMBITOS_TERRITORIALES_RC)[number]

export type FormularioRC = {
  ramo: 'rc'
  /** CNAE-2009 de 4 dígitos («5610»). Al menos uno de `cnae` / `actividadDescripcion`. */
  cnae: string | null
  actividadDescripcion: string | null
  facturacionAnualEur: number
  numEmpleados: number
  superficieLocalM2: number | null
  limiteIndemnizacionEur: number
  ambitoTerritorial: AmbitoTerritorialRc
  /** Qué coberturas adicionales quiere: `null` = no se ha preguntado. */
  quiereRcPatronal: boolean | null
  quiereRcProductosPostTrabajos: boolean | null
  quiereRcLocativa: boolean | null
  siniestrosUltimos3Anios: number | null
  importeSiniestrosUltimos3AniosEur: number | null
}

export type ValidacionFormularioRC = { ok: true; formulario: FormularioRC } | { ok: false; errores: string[] }

const vacio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function texto(v: unknown, campo: string, errores: string[], max = 300): string | null {
  if (vacio(v)) return null
  if (typeof v !== 'string') { errores.push(`${campo}: tiene que ser texto`); return null }
  return v.trim().slice(0, max)
}

/** Importe en euros (número, no texto). `permitirCero`: 0 es un dato válido (p. ej. siniestros sin coste). */
function importe(v: unknown, campo: string, errores: string[], permitirCero = false): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n < 0 || (n === 0 && !permitirCero)) {
    errores.push(`${campo}: tiene que ser un importe en euros ${permitirCero ? 'no negativo' : 'mayor que 0'} (número, no texto)`)
    return null
  }
  return Math.round(n * 100) / 100
}

function entero(v: unknown, campo: string, errores: string[], max = 1_000_000): number | null {
  if (vacio(v)) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isInteger(n) || n < 0 || n > max) { errores.push(`${campo}: «${String(v)}» no es un entero entre 0 y ${max}`); return null }
  return n
}

function booleano(v: unknown, campo: string, errores: string[]): boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'boolean') { errores.push(`${campo}: tiene que ser true/false (o no venir)`); return null }
  return v
}

/** «5610» o «56.10» → «5610»; cualquier otra cosa → null (el llamante lo marca error). */
export function normalizarCnae(v: string): string | null {
  const t = v.trim().replace(/\./g, '')
  return /^\d{4}$/.test(t) ? t : null
}

export function validarFormularioRC(entrada: unknown): ValidacionFormularioRC {
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

  const facturacion = importe(e.facturacionAnualEur, 'facturacionAnualEur', errores)
  if (facturacion === null && vacio(e.facturacionAnualEur)) errores.push('facturacionAnualEur: obligatorio')
  const empleados = entero(e.numEmpleados, 'numEmpleados', errores)
  if (empleados === null && vacio(e.numEmpleados)) errores.push('numEmpleados: obligatorio (0 si no hay empleados)')
  const limite = importe(e.limiteIndemnizacionEur, 'limiteIndemnizacionEur', errores)
  if (limite === null && vacio(e.limiteIndemnizacionEur)) errores.push('limiteIndemnizacionEur: obligatorio')

  let ambito: AmbitoTerritorialRc | null = null
  if (vacio(e.ambitoTerritorial)) errores.push('ambitoTerritorial: obligatorio')
  else if (typeof e.ambitoTerritorial === 'string' && (AMBITOS_TERRITORIALES_RC as readonly string[]).includes(e.ambitoTerritorial)) ambito = e.ambitoTerritorial as AmbitoTerritorialRc
  else errores.push(`ambitoTerritorial: «${String(e.ambitoTerritorial)}» no es uno de ${AMBITOS_TERRITORIALES_RC.join(', ')}`)

  const superficie = importe(e.superficieLocalM2, 'superficieLocalM2', errores)
  const siniestros = entero(e.siniestrosUltimos3Anios, 'siniestrosUltimos3Anios', errores, 1000)
  const importeSiniestros = importe(e.importeSiniestrosUltimos3AniosEur, 'importeSiniestrosUltimos3AniosEur', errores, true)
  // Sin siniestros no puede haber importe: contradicción, no se adivina cuál es el dato bueno.
  if (siniestros === 0 && importeSiniestros !== null && importeSiniestros > 0) errores.push('importeSiniestrosUltimos3AniosEur: hay importe pero siniestrosUltimos3Anios es 0')

  const quiereRcPatronal = booleano(e.quiereRcPatronal, 'quiereRcPatronal', errores)
  const quiereRcProductosPostTrabajos = booleano(e.quiereRcProductosPostTrabajos, 'quiereRcProductosPostTrabajos', errores)
  const quiereRcLocativa = booleano(e.quiereRcLocativa, 'quiereRcLocativa', errores)
  // Pedir RC patronal sin empleados no tiene sentido.
  if (quiereRcPatronal === true && empleados === 0) errores.push('quiereRcPatronal: se pide RC patronal pero numEmpleados es 0')

  if (errores.length || facturacion === null || empleados === null || limite === null || ambito === null) return { ok: false, errores }
  return {
    ok: true,
    formulario: {
      ramo: 'rc',
      cnae,
      actividadDescripcion,
      facturacionAnualEur: facturacion,
      numEmpleados: empleados,
      superficieLocalM2: superficie,
      limiteIndemnizacionEur: limite,
      ambitoTerritorial: ambito,
      quiereRcPatronal,
      quiereRcProductosPostTrabajos,
      quiereRcLocativa,
      siniestrosUltimos3Anios: siniestros,
      importeSiniestrosUltimos3AniosEur: importeSiniestros,
    },
  }
}
