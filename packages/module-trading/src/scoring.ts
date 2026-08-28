import type { Tesis, Estrategia } from './types.ts'

export type Resultado = {
  estrategia: Estrategia
  acierto: boolean
  retorno: number
  // ── H13/H14 (28/08/2026): lo mismo, pero contra el MERCADO y con el peaje puesto. Se RECOLECTAN;
  // `ajustesDeStats` sigue decidiendo con `acierto`/`retorno` hasta que las hipótesis se resuelvan.
  retornoNeto: number                 // retorno − COSTE_ROUNDTRIP
  retornoAlfa: number | null          // exceso sobre el índice; null = no había benchmark que restar
  aciertoAlfa: boolean | null         // ¿batió al índice en la dirección de la tesis?
}

// Peaje de ida y vuelta de UNA operación, en fracción (0,002 = 0,2%): comisión + horquilla estimadas.
// El número está firmado en H14 del pre-registro; no se toca sin una entrada nueva fechada. Se aplica
// a TODAS las tesis por igual, también a las neutrales (retorno 0 → neto negativo), porque una regla
// que dice «no operes» no paga peaje: quien lo paga es quien opera, y por eso el neto de una neutral
// NO se compara con el de una direccional sin decirlo. Ver el caveat firmado en H14.
export const COSTE_ROUNDTRIP = 0.002

// Puntúa una tesis contra un precio POSTERIOR (walk-forward: precioDespues es de después de precioRef).
// `retorno` es el retorno de SEGUIR la tesis, no el movimiento bruto del precio: una bajista que
// acierta una caída del 5% anota +5% (no −5%), y una neutral está fuera del mercado (0). Antes se
// devolvía el movimiento bruto para las tres direcciones → como cada pasada crea una tesis POR
// estrategia sobre el mismo símbolo/ventana, las cuatro estrategias empataban en retornoMedio por
// construcción y ajustesDeStats penalizaba a una estrategia porque el MERCADO cayó, no porque
// se equivocara (arreglado 01/08/2026; el movimiento bruto sigue derivable de precioRef/precioDespues).
export function puntuarTesis(t: Tesis, precioDespues: number, retornoBench?: number | null): Resultado {
  const movimiento = (precioDespues - t.precioRef) / t.precioRef
  const subio = precioDespues > t.precioRef
  const acierto =
    (t.direccion === 'alcista' && subio) ||
    (t.direccion === 'bajista' && !subio) ||
    (t.direccion === 'neutral' && Math.abs(movimiento) < 0.02)
  const segunDireccion = (m: number) =>
    t.direccion === 'bajista' ? -m : t.direccion === 'neutral' ? 0 : m
  const retorno = segunDireccion(movimiento)
  // ALFA (H13): el mismo cálculo con el movimiento EN EXCESO sobre el índice. Sin benchmark queda en
  // null — «no se ha podido medir», nunca un 0 que se leería como «no batió ni perdió al mercado».
  const retornoAlfa = retornoBench == null ? null : segunDireccion(movimiento - retornoBench)
  return resultadoDeFila({ estrategia: t.estrategia, acierto, retorno, retornoAlfa })
}

// Lo que de una observación se PERSISTE (el resto se deriva). Sirve para reconstruir un `Resultado`
// desde la BD sin que el consumidor tenga que recordar cómo se calculan el neto y el acierto de alfa:
// esas dos definiciones viven aquí y en ningún otro sitio.
export type FilaResultado = { estrategia: Estrategia; acierto: boolean; retorno: number; retornoAlfa: number | null }

export function resultadoDeFila(f: FilaResultado): Resultado {
  return {
    ...f,
    retornoNeto: f.retorno - COSTE_ROUNDTRIP,
    // Acertar contra el MERCADO, no contra el cero: es la pregunta que `acierto` no responde.
    aciertoAlfa: f.retornoAlfa == null ? null : f.retornoAlfa > 0,
  }
}

export type StatsEstrategia = {
  hitRate: number
  retornoMedio: number
  n: number
  // H13/H14, en sombra. `nAlfa` cuenta SOLO las observaciones que tenían benchmark: una sin él no es
  // un alfa de 0, es un alfa que no se pudo medir, y meterla en la media la acercaría a cero sola.
  retornoNetoMedio: number
  hitRateAlfa: number | null
  retornoAlfaMedio: number | null
  nAlfa: number
}

// Traduce el rendimiento histórico por estrategia en un DELTA de confianza (el bucle de aprendizaje).
// Guarda de muestra: por debajo de `minN` resultados NO ajusta (no aprender de ruido, como el Director de
// IA con DIRECTOR_MIN_LLAMADAS). hitRate 0,5 = neutro; ±0,2 → ±10; un retornoMedio negativo penaliza
// extra. Acotado a ±20 para que el aprendizaje incline, no dé la vuelta a las reglas. Lo consume torneo().
// 🚨 `minN` y el clamp de ±20 NO están validados: salieron por analogía con el Director de IA y nadie
// ha medido si son los buenos (H15 del pre-registro los pone a prueba). Y esta función sigue decidiendo
// con `hitRate`/`retornoMedio` BRUTOS y ABSOLUTOS a propósito: el alfa y el neto se recolectan (H13/H14)
// y no tocan el torneo hasta que sus criterios firmados se cumplan.
// El parámetro pide SOLO lo que se usa: así el consumidor (que las lee de la BD) no tiene que fabricar
// los campos en sombra para llamar, y queda escrito en el tipo qué entra hoy en la decisión.
export type StatsDecision = Pick<StatsEstrategia, 'hitRate' | 'retornoMedio' | 'n'>

export function ajustesDeStats(stats: Record<string, StatsDecision>, minN = 20): Record<string, number> {
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
    const conAlfa = rs.filter(r => r.retornoAlfa != null)
    out[est] = {
      hitRate: aciertos / rs.length,
      retornoMedio: rs.reduce((a, b) => a + b.retorno, 0) / rs.length,
      n: rs.length,
      retornoNetoMedio: rs.reduce((a, b) => a + b.retornoNeto, 0) / rs.length,
      hitRateAlfa: conAlfa.length ? conAlfa.filter(r => r.aciertoAlfa).length / conAlfa.length : null,
      retornoAlfaMedio: conAlfa.length ? conAlfa.reduce((a, b) => a + (b.retornoAlfa as number), 0) / conAlfa.length : null,
      nAlfa: conAlfa.length,
    }
  }
  return out
}
