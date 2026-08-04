import type { Tesis, Estrategia } from './types.ts'

export type Resultado = { estrategia: Estrategia; acierto: boolean; retorno: number }

// Puntúa una tesis contra un precio POSTERIOR (walk-forward: precioDespues es de después de precioRef).
// `retorno` es el retorno de SEGUIR la tesis, no el movimiento bruto del precio: una bajista que
// acierta una caída del 5% anota +5% (no −5%), y una neutral está fuera del mercado (0). Antes se
// devolvía el movimiento bruto para las tres direcciones → como cada pasada crea una tesis POR
// estrategia sobre el mismo símbolo/ventana, las cuatro estrategias empataban en retornoMedio por
// construcción y ajustesDeStats penalizaba a una estrategia porque el MERCADO cayó, no porque
// se equivocara (arreglado 01/08/2026; el movimiento bruto sigue derivable de precioRef/precioDespues).
export function puntuarTesis(t: Tesis, precioDespues: number): Resultado {
  const movimiento = (precioDespues - t.precioRef) / t.precioRef
  const subio = precioDespues > t.precioRef
  const acierto =
    (t.direccion === 'alcista' && subio) ||
    (t.direccion === 'bajista' && !subio) ||
    (t.direccion === 'neutral' && Math.abs(movimiento) < 0.02)
  const retorno = t.direccion === 'bajista' ? -movimiento : t.direccion === 'neutral' ? 0 : movimiento
  return { estrategia: t.estrategia, acierto, retorno }
}

export type StatsEstrategia = { hitRate: number; retornoMedio: number; n: number }

// Traduce el rendimiento histórico por estrategia en un DELTA de confianza (el bucle de aprendizaje).
// Guarda de muestra: por debajo de `minN` resultados NO ajusta (no aprender de ruido, como el Director de
// IA con DIRECTOR_MIN_LLAMADAS). hitRate 0,5 = neutro; ±0,2 → ±10; un retornoMedio negativo penaliza
// extra. Acotado a ±20 para que el aprendizaje incline, no dé la vuelta a las reglas. Lo consume torneo().
export function ajustesDeStats(stats: Record<string, StatsEstrategia>, minN = 20): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [est, s] of Object.entries(stats)) {
    if (s.n < minN) continue
    let d = Math.round((s.hitRate - 0.5) * 50)
    if (s.retornoMedio < 0) d -= 5
    const clamp = Math.max(-20, Math.min(20, d))
    if (clamp !== 0) out[est] = clamp
  }
  return out
}

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
