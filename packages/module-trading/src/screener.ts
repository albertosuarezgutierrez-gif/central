import type { Candidato, CriteriosScreener, Fundamentales } from './types.ts'

// ¿Cotiza por debajo de su valor? Dos vías (cualquiera vale):
//  (a) descuento vs valor razonable (DCF): precio ≤ valorRazonable * (1 - margen).
//  (b) barata por múltiplos: PER < 15 y PB < 3 (value clásico).
export function infravalorada(f: Fundamentales | undefined, precio: number, margen = 0.15): boolean {
  if (!f) return false
  if (f.valorRazonable !== undefined && f.valorRazonable > 0) {
    if (precio <= f.valorRazonable * (1 - margen)) return true
  }
  const perBarato = f.per !== undefined && f.per > 0 && f.per < 15
  const pbBarato = f.pb !== undefined && f.pb > 0 && f.pb < 3
  return perBarato && pbBarato
}

// Aplica los criterios presentes al candidato. Devuelve si pasa + los motivos por los que NO.
export function pasaScreener(c: Candidato, crit: CriteriosScreener): { pasa: boolean; motivos: string[] } {
  const motivos: string[] = []
  const f = c.fundamentales
  if (crit.rvolMin !== undefined && !(c.rvol !== undefined && c.rvol >= crit.rvolMin))
    motivos.push(`rvol ${c.rvol?.toFixed(2) ?? '?'} < ${crit.rvolMin}`)
  if (crit.perMax !== undefined && !(f?.per !== undefined && f.per > 0 && f.per <= crit.perMax))
    motivos.push(`PER ${f?.per ?? '?'} > ${crit.perMax}`)
  if (crit.pbMax !== undefined && !(f?.pb !== undefined && f.pb > 0 && f.pb <= crit.pbMax))
    motivos.push(`PB ${f?.pb ?? '?'} > ${crit.pbMax}`)
  if (crit.descuentoMinVsValor !== undefined) {
    const ok = f?.valorRazonable !== undefined && f.valorRazonable > 0 &&
      (f.valorRazonable - c.precio) / f.valorRazonable >= crit.descuentoMinVsValor
    if (!ok) motivos.push(`sin ${(crit.descuentoMinVsValor * 100).toFixed(0)}% de descuento vs valor`)
  }
  if (crit.precioMin !== undefined && c.precio < crit.precioMin) motivos.push(`precio < ${crit.precioMin}`)
  if (crit.precioMax !== undefined && c.precio > crit.precioMax) motivos.push(`precio > ${crit.precioMax}`)
  return { pasa: motivos.length === 0, motivos }
}

// Puntúa un candidato para ordenar la cantera: premia volumen inusual + descuento vs valor.
export function puntuarCandidato(c: Candidato): number {
  let score = 0
  if (c.rvol !== undefined) score += Math.max(0, c.rvol - 1) * 40        // cada punto de rvol pesa
  const f = c.fundamentales
  if (f?.valorRazonable !== undefined && f.valorRazonable > 0)
    score += Math.max(0, (f.valorRazonable - c.precio) / f.valorRazonable) * 60   // descuento
  if (infravalorada(f, c.precio)) score += 15
  return score
}

// Filtra por criterios y ordena por score (mejores primero).
export function rankearCantera(candidatos: Candidato[], crit: CriteriosScreener): Candidato[] {
  return candidatos
    .filter(c => pasaScreener(c, crit).pasa)
    .sort((a, b) => puntuarCandidato(b) - puntuarCandidato(a))
}
