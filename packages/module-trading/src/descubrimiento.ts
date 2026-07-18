import type { Candidato, CriteriosScreener } from './types.ts'
import { pasaScreener, infravalorada } from './screener.ts'

// Motor de DESCUBRIMIENTO autónomo (capa C). El agente reúne candidatos de varias fuentes
// —temas de IBKR (Nuclear, Quantum, Defensa…), screener de FMP, picos de volumen— y este
// módulo los funde, prioriza y filtra por riesgo. NO opera: entrega una lista para estudiar
// en el mismo torneo (paper). La clave: un valor que aparece en VARIAS fuentes es mejor lead,
// y la volatilidad extrema (la que hizo daño a la cartera real) se penaliza o descarta.

// Une candidatos de varias fuentes deduplicando por símbolo: fusiona fuentes y fundamentales,
// y se queda con el rvol/volAnual más informativo.
export function dedupCandidatos(candidatos: Candidato[]): Candidato[] {
  const porSimbolo = new Map<string, Candidato>()
  for (const c of candidatos) {
    const prev = porSimbolo.get(c.simbolo)
    if (!prev) { porSimbolo.set(c.simbolo, { ...c, fuentes: [...(c.fuentes ?? [])] }); continue }
    prev.fuentes = Array.from(new Set([...(prev.fuentes ?? []), ...(c.fuentes ?? [])]))
    prev.rvol = Math.max(prev.rvol ?? 0, c.rvol ?? 0) || undefined
    prev.volAnual = prev.volAnual ?? c.volAnual
    prev.fundamentales = { ...c.fundamentales, ...prev.fundamentales }
    prev.sector = prev.sector ?? c.sector
    prev.posRango52 = prev.posRango52 ?? c.posRango52
    prev.tendencia = prev.tendencia ?? c.tendencia
  }
  return [...porSimbolo.values()]
}

// Puntúa un descubrimiento: coincidir en VARIAS fuentes suma; volumen inusual suma; descuento
// vs valor suma; volatilidad alta RESTA (la lección de la cartera real).
export function puntuarDescubrimiento(c: Candidato): number {
  let score = 0
  const nFuentes = c.fuentes?.length ?? 1
  score += (nFuentes - 1) * 25                                   // corroboración multi-fuente
  if (c.rvol !== undefined) score += Math.max(0, c.rvol - 1) * 30
  const f = c.fundamentales
  if (f?.valorRazonable !== undefined && f.valorRazonable > 0)
    score += Math.max(0, (f.valorRazonable - c.precio) / f.valorRazonable) * 50
  if (infravalorada(f, c.precio)) score += 15
  if (c.posRango52 !== undefined) score += Math.max(0, 1 - c.posRango52) * 20  // cerca de mínimos 52s (barata)
  if (c.volAnual !== undefined) score -= Math.max(0, c.volAnual - 0.4) * 40   // castiga la lotería
  return score
}

// Flujo completo: dedup → filtra por criterios (incl. tope de volatilidad) → ordena por score.
export function descubrir(candidatos: Candidato[], criterios: CriteriosScreener = {}): Candidato[] {
  return dedupCandidatos(candidatos)
    .filter(c => pasaScreener(c, criterios).pasa)
    .sort((a, b) => puntuarDescubrimiento(b) - puntuarDescubrimiento(a))
}
