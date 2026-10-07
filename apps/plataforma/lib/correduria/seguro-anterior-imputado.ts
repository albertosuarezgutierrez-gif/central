// El seguro anterior IMPUTADO a un vehículo nuevo (03/10/2026, Alberto): asegura propone qué póliza
// de motor del cliente se declara como seguro anterior («el vehículo es nuevo, el historial es del
// conductor») y si el bonus va SUPUESTO (años sin siniestros al máximo porque no constaban →
// precio condicionado a SINCO/certificado; no se emite sin verificar). Aquí solo se LEE lo que manda
// el puerto (`seguroAnterior` en precalificar-*-nuevo y en la respuesta de cotizar). Puro.

import { polizaAnteriorParaTarificar } from '@central/module-seguros'

export type CandidataImputable = {
  id: string
  origen: 'cartera' | 'competencia'
  tipoVehiculo: 'turismo' | 'moto' | null
  compania: string | null
  etiqueta: string | null
  /** Nombre del cónyuge/pareja si la póliza es SUYA; `null` = del tomador. */
  delConyuge: string | null
  numeroPoliza: string | null
  /** Código DGS de la compañía (para saber cómo viaja el nº de póliza). */
  codigoDgs?: string | null
  fechaEfecto: string | null
  canal: string | null
  cesionDerechos: boolean | null
  aniosSinSiniestros: number | null
  conSiniestrosConocidos: boolean
  /** Vacío = se puede declarar. */
  faltan: string[]
}

export type SeguroAnteriorImputado = {
  estado: 'imputado' | 'ninguno' | 'desactivado' | 'manual' | 'no_disponible'
  elegida: CandidataImputable | null
  porque: string
  alternativas: CandidataImputable[]
  avisos: string[]
  elegidaPorCorredor: boolean
  bonusSupuesto: boolean
  condicion: string | null
  /** `true` = no se pudo comprobar el cónyuge (≠ «no tiene»). */
  conyugeNoMirado: boolean
}

const ESTADOS = new Set(['imputado', 'ninguno', 'desactivado', 'manual', 'no_disponible'])

function txt(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function candidata(v: unknown): CandidataImputable | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const id = txt(o.id)
  if (!id) return null
  return {
    id,
    origen: o.origen === 'competencia' ? 'competencia' : 'cartera',
    tipoVehiculo: o.tipoVehiculo === 'turismo' || o.tipoVehiculo === 'moto' ? o.tipoVehiculo : null,
    compania: txt(o.compania),
    etiqueta: txt(o.etiqueta),
    delConyuge: txt(o.delConyuge),
    numeroPoliza: txt(o.numeroPoliza),
    codigoDgs: txt(o.codigoDgs),
    fechaEfecto: txt(o.fechaEfecto),
    canal: txt(o.canal),
    cesionDerechos: typeof o.cesionDerechos === 'boolean' ? o.cesionDerechos : null,
    aniosSinSiniestros: typeof o.aniosSinSiniestros === 'number' ? o.aniosSinSiniestros : null,
    conSiniestrosConocidos: o.conSiniestrosConocidos === true,
    faltan: Array.isArray(o.faltan) ? o.faltan.filter((f): f is string => typeof f === 'string') : [],
  }
}

/** Lo que manda el puerto → tipo. `null` = no vino (asegura antigua): no es «no tiene seguro anterior». */
export function leerSeguroAnteriorImputado(v: unknown): SeguroAnteriorImputado | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.estado !== 'string' || !ESTADOS.has(o.estado)) return null
  return {
    estado: o.estado as SeguroAnteriorImputado['estado'],
    elegida: candidata(o.elegida),
    porque: txt(o.porque) ?? '',
    alternativas: Array.isArray(o.alternativas) ? o.alternativas.map(candidata).filter((c): c is CandidataImputable => c !== null) : [],
    avisos: Array.isArray(o.avisos) ? o.avisos.filter((a): a is string => typeof a === 'string') : [],
    elegidaPorCorredor: o.elegidaPorCorredor === true,
    // Fail-closed: solo `false` explícito es «no supuesto».
    bonusSupuesto: o.bonusSupuesto !== false,
    condicion: txt(o.condicion),
    conyugeNoMirado: o.conyugeNoMirado === true,
  }
}

/** «MAPFRE · nº 1234 · 1234ABC · Nissan Juke · moto · desde 2019 [· del cónyuge: Ana]» para pantalla. */
export function describirCandidata(c: CandidataImputable): string {
  const desde = c.fechaEfecto?.match(/^(\d{4})/)?.[1]
  return [
    c.compania,
    c.numeroPoliza ? `nº ${polizaAnteriorParaTarificar(c.numeroPoliza, c.codigoDgs)}` : null,
    c.etiqueta,
    c.tipoVehiculo === 'moto' ? 'moto' : c.tipoVehiculo === 'turismo' ? 'turismo' : null,
    desde ? `desde ${desde}` : null,
    c.delConyuge ? `del cónyuge: ${c.delConyuge}` : null,
  ].filter(Boolean).join(' · ')
}

/** Las que el corredor puede elegir en lugar de la propuesta (declarables). */
export function elegibles(s: SeguroAnteriorImputado): CandidataImputable[] {
  return [...(s.elegida ? [s.elegida] : []), ...s.alternativas].filter((c) => c.faltan.length === 0)
}

/** Efecto más antiguo primero (es lo que más bonifica); sin fecha, al final; empate por id. */
function porAntiguedad(a: CandidataImputable, b: CandidataImputable): number {
  const fa = a.fechaEfecto
  const fb = b.fechaEfecto
  if (fa && fb && fa !== fb) return fa < fb ? -1 : 1
  if (fa && !fb) return -1
  if (!fa && fb) return 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export const AVISO_CONYUGE_NO_MIRADO = 'No se pudo comprobar el cónyuge'

export const AVISO_SIN_PROPIAS = 'Sin seguro anterior propio; puedes usar el del cónyuge si la compañía lo admite'

/**
 * El desplegable de «seguro anterior»: las del TOMADOR primero y las del CÓNYUGE en grupo aparte, cada
 * grupo por antigüedad. `avisoSinPropias` solo si el tomador no tiene NINGUNA póliza de motor conocida
 * (declarable o no: con una incompleta no es verdad que «no tenga») y el cónyuge sí tiene alguna elegible.
 */
export function agruparElegibles(s: SeguroAnteriorImputado): {
  propias: CandidataImputable[]
  conyuge: CandidataImputable[]
  avisoSinPropias: string | null
} {
  const todas = [...(s.elegida ? [s.elegida] : []), ...s.alternativas]
  const declarables = todas.filter((c) => c.faltan.length === 0)
  const propias = declarables.filter((c) => !c.delConyuge).sort(porAntiguedad)
  const conyuge = declarables.filter((c) => c.delConyuge).sort(porAntiguedad)
  const tienePropias = todas.some((c) => !c.delConyuge)
  return { propias, conyuge, avisoSinPropias: !tienePropias && conyuge.length > 0 ? AVISO_SIN_PROPIAS : null }
}
