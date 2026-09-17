// lib/seo-correduria/agente-decidir.ts — qué ramo de asegura-web merece una propuesta de
// metadata nueva, a partir del SERP semanal. Puro: no toca red ni BD.
//
// Criterio v1 (deliberadamente simple): un ramo con página propia que NO aparece en el
// top-10 de su consulta principal es candidato — no hay CTR que optimizar si ni siquiera
// se ve. `propia === null` es «fuera del top-10», no «posición 0» (ver tipos.ts).
import type { ConsultaSerp } from './tipos.ts'
import { enCooldown, slugEditable } from './agente-guardrails.ts'

export type CandidatoRamo = { slug: string; consulta: string }

/** '/seguros/hogar' → 'hogar'; cualquier otra forma (null, '/', '/quienes-somos') → null. */
export function slugDeRuta(pagina: string | null): string | null {
  const m = pagina?.match(/^\/seguros\/([a-z0-9-]+)$/)
  return m ? m[1] : null
}

/**
 * Candidatos: consultas de grupo 'ramo' cuya página es un slug editable, no están en el
 * top-10 (`propia === null`), no están en cooldown, hasta `max`. Orden: el orden de `CONSULTAS`
 * (que ya está priorizado por comisión, ver lib/ramos.ts), no por posición — no hay con qué
 * ordenar por posición cuando la señal es justo "no aparece".
 */
export function candidatosRamo(
  consultas: ConsultaSerp[],
  ramosEditables: readonly string[],
  recientes: { ruta: string; creadoEn: string | Date }[],
  ahora: Date,
  max: number,
): CandidatoRamo[] {
  const vistos = new Set<string>()
  const salida: CandidatoRamo[] = []
  for (const c of consultas) {
    const slug = slugDeRuta(c.pagina)
    if (!slug || vistos.has(slug)) continue
    if (!slugEditable(slug, ramosEditables)) continue
    if (c.propia !== null) continue // ya está en el top-10: no toca esta pasada
    if (enCooldown(slug, recientes, ahora)) continue
    vistos.add(slug)
    salida.push({ slug, consulta: c.consulta })
    if (salida.length >= max) break
  }
  return salida
}
