// Motor de scoring de empresa (puro). Agrupa los eventos BORME de una empresa y devuelve un
// score 0–100 con motivo legible. Opcionalmente suma señales FINANCIERAS (balance/morosidad) que
// solo existen tras el enriquecimiento (eInforma/RAI-ASNEF) — mientras no haya dato, no puntúan.
// Sin BD ni red → testeable con `node --test`.
import type { TipoEvento } from './borme'

const PESOS: Record<TipoEvento, number> = {
  concurso: 70,
  disolucion: 45,
  ampliacion_capital: 20,
  cese: 10,
  otro: 0,
}
const ETIQUETA: Record<TipoEvento, string> = {
  concurso: 'concurso de acreedores',
  disolucion: 'disolución/extinción',
  ampliacion_capital: 'ampliación de capital (tocó financiación)',
  cese: 'cambios en administración',
  otro: '',
}

// Señales financieras (fuente de pago: cuentas depositadas vía eInforma + módulo de morosidad).
// Umbrales fijados por Alberto (17/07/2026). Cada campo es opcional: si no hay dato, no suma.
export interface SenalesFinancieras {
  /** Patrimonio neto < 0 € o muy cercano a cero (causa de disolución art. 363 LSC). */
  patrimonioNetoNegativo?: boolean
  /** EBITDA negativo durante ≥2 ejercicios consecutivos. */
  ebitdaNegativo2Anios?: boolean
  /** Fondo de maniobra (activo corriente − pasivo corriente) negativo de forma sostenida. */
  fondoManiobraNegativo?: boolean
  /** Meses de retraso del último depósito de cuentas (>12 = señal). */
  cuentasRetrasoMeses?: number
  /** Incidencias de pago registradas: RAI / ASNEF / impagos. */
  incidenciasPago?: boolean
  /** Ratio deuda financiera / EBITDA (>6× = señal de sobreendeudamiento). */
  deudaEbitda?: number | null
  /** Refinanciaciones frecuentes (novaciones/reestructuraciones repetidas). */
  refinanciacionesFrecuentes?: boolean
}

// Pesos de las señales financieras. Primera versión, TUNEABLE en la fase de calibrado.
const RETRASO_CUENTAS_MESES = 12
const DEUDA_EBITDA_UMBRAL = 6
const PESO_FIN = {
  patrimonioNetoNegativo: 60,
  ebitdaNegativo2Anios: 40,
  fondoManiobraNegativo: 25,
  cuentasRetraso: 20,
  incidenciasPago: 45,
  deudaEbitdaAlta: 35,
  refinanciacionesFrecuentes: 20,
} as const

/** Devuelve [puntos, etiquetas] de las señales financieras presentes (las ausentes no suman). */
function puntuarFinanciero(f: SenalesFinancieras): [number, string[]] {
  let p = 0
  const et: string[] = []
  if (f.patrimonioNetoNegativo) { p += PESO_FIN.patrimonioNetoNegativo; et.push('patrimonio neto negativo') }
  if (f.ebitdaNegativo2Anios) { p += PESO_FIN.ebitdaNegativo2Anios; et.push('EBITDA negativo 2 años') }
  if (f.fondoManiobraNegativo) { p += PESO_FIN.fondoManiobraNegativo; et.push('fondo de maniobra negativo') }
  if (typeof f.cuentasRetrasoMeses === 'number' && f.cuentasRetrasoMeses > RETRASO_CUENTAS_MESES) {
    p += PESO_FIN.cuentasRetraso; et.push('cuentas sin depositar >12 meses')
  }
  if (f.incidenciasPago) { p += PESO_FIN.incidenciasPago; et.push('incidencias de pago (RAI/ASNEF)') }
  if (typeof f.deudaEbitda === 'number' && f.deudaEbitda > DEUDA_EBITDA_UMBRAL) {
    p += PESO_FIN.deudaEbitdaAlta; et.push('deuda/EBITDA >6×')
  }
  if (f.refinanciacionesFrecuentes) { p += PESO_FIN.refinanciacionesFrecuentes; et.push('refinanciaciones frecuentes') }
  return [p, et]
}

export interface EntradaScore {
  empresa: string
  empresaNorm: string
  provincia: string | null
  eventos: Array<{ tipo: TipoEvento; fecha: string }>
  /** Señales financieras del enriquecimiento (opcional; sin dato = no puntúa). */
  financiero?: SenalesFinancieras
}
export interface ResultadoScore {
  empresa: string
  empresaNorm: string
  provincia: string | null
  score: number
  motivo: string
}

/** Puntúa una empresa por la unión de sus tipos de evento + señales financieras (no acumula el mismo tipo repetido). */
export function puntuarEmpresa(e: EntradaScore): ResultadoScore {
  const tipos = new Set(e.eventos.map((x) => x.tipo))
  let score = 0
  for (const t of tipos) score += PESOS[t]
  const etiquetas = [...tipos].filter((t) => t !== 'otro').map((t) => ETIQUETA[t])
  if (e.financiero) {
    const [p, et] = puntuarFinanciero(e.financiero)
    score += p
    etiquetas.push(...et)
  }
  score = Math.min(100, score)
  const motivo = etiquetas.filter(Boolean).join(' + ') || 'sin señales relevantes'
  return { empresa: e.empresa, empresaNorm: e.empresaNorm, provincia: e.provincia, score, motivo }
}
