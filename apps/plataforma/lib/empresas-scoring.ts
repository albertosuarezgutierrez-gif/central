// Motor de scoring de empresa (puro). Agrupa los eventos BORME de una empresa y devuelve un
// score 0–100 con motivo legible. Sin BD ni red → testeable con `node --test`.
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

export interface EntradaScore {
  empresa: string
  empresaNorm: string
  provincia: string | null
  eventos: Array<{ tipo: TipoEvento; fecha: string }>
}
export interface ResultadoScore {
  empresa: string
  empresaNorm: string
  provincia: string | null
  score: number
  motivo: string
}

/** Puntúa una empresa por la unión de sus tipos de evento (no acumula el mismo tipo repetido). */
export function puntuarEmpresa(e: EntradaScore): ResultadoScore {
  const tipos = new Set(e.eventos.map((x) => x.tipo))
  let score = 0
  for (const t of tipos) score += PESOS[t]
  score = Math.min(100, score)
  const motivo =
    [...tipos]
      .filter((t) => t !== 'otro')
      .map((t) => ETIQUETA[t])
      .join(' + ') || 'sin señales relevantes'
  return { empresa: e.empresa, empresaNorm: e.empresaNorm, provincia: e.provincia, score, motivo }
}
