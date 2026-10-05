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
  }
}

/** «MAPFRE · nº …1234 · 1234ABC · Nissan Juke · efecto 2023-01-01» para pantalla. */
export function describirCandidata(c: CandidataImputable): string {
  return [
    c.compania,
    c.numeroPoliza ? `nº ${polizaAnteriorParaTarificar(c.numeroPoliza, c.codigoDgs)}` : null,
    c.etiqueta,
    c.tipoVehiculo === 'moto' ? 'moto' : c.tipoVehiculo === 'turismo' ? 'turismo' : null,
    c.fechaEfecto ? `efecto ${c.fechaEfecto}` : null,
  ].filter(Boolean).join(' · ')
}

/** Las que el corredor puede elegir en lugar de la propuesta (declarables). */
export function elegibles(s: SeguroAnteriorImputado): CandidataImputable[] {
  return [...(s.elegida ? [s.elegida] : []), ...s.alternativas].filter((c) => c.faltan.length === 0)
}
