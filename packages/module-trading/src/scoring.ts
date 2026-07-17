import type { Tesis, Estrategia } from './types.ts'

export type Resultado = { estrategia: Estrategia; acierto: boolean; retorno: number }

// Puntúa una tesis contra un precio POSTERIOR (walk-forward: precioDespues es de después de precioRef).
export function puntuarTesis(t: Tesis, precioDespues: number): Resultado {
  const retorno = (precioDespues - t.precioRef) / t.precioRef
  const subio = precioDespues > t.precioRef
  const acierto =
    (t.direccion === 'alcista' && subio) ||
    (t.direccion === 'bajista' && !subio) ||
    (t.direccion === 'neutral' && Math.abs(retorno) < 0.02)
  return { estrategia: t.estrategia, acierto, retorno }
}

export type StatsEstrategia = { hitRate: number; retornoMedio: number; n: number }

export function agregarStats(resultados: Resultado[]): Record<string, StatsEstrategia> {
  const out: Record<string, StatsEstrategia> = {}
  const grupos = new Map<string, Resultado[]>()
  for (const r of resultados) {
    const g = grupos.get(r.estrategia) ?? []
    g.push(r); grupos.set(r.estrategia, g)
  }
  for (const [est, rs] of grupos) {
    const aciertos = rs.filter(r => r.acierto).length
    out[est] = {
      hitRate: aciertos / rs.length,
      retornoMedio: rs.reduce((a, b) => a + b.retorno, 0) / rs.length,
      n: rs.length,
    }
  }
  return out
}
