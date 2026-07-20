// Resolución de la consulta del buscador «Analiza una acción» (20/07/2026): Alberto escribe un TICKER
// («PYPL») o un NOMBRE («PayPal», «paypal holdings») y hay que resolverlo contra el universo de la
// caché SIN IA: match exacto de ticker → esa; si no, por nombre/prefijo → 1 candidato = se analiza
// directo, varios = se le sugieren («¿querías decir…?»). Determinista y puro (testeable).

export type CandidatoSimbolo = { simbolo: string; nombre: string | null; mktCap?: number | null }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Candidatos para una consulta: [exacto] si el ticker existe tal cual; si no, filas cuyo NOMBRE
// contiene la consulta o cuyo ticker empieza por ella, ordenadas por capitalización (la grande
// primero: «paypal» debe proponer PYPL antes que una small-cap con nombre parecido).
export function buscarCandidatos(q: string, filas: CandidatoSimbolo[], max = 6): CandidatoSimbolo[] {
  const limpio = q.trim()
  if (limpio.length < 2) return []
  const ticker = limpio.toUpperCase()
  const exacto = filas.find(f => f.simbolo === ticker)
  if (exacto) return [exacto]
  const nq = norm(limpio)
  return filas
    .filter(f => (f.nombre != null && norm(f.nombre).includes(nq)) || f.simbolo.startsWith(ticker))
    .sort((a, b) => (b.mktCap ?? 0) - (a.mktCap ?? 0))
    .slice(0, max)
}
