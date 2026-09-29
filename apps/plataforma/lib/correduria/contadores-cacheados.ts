import { unstable_cache } from 'next/cache'
import { colaLlamadas, interpretarLeads, leadsCompetenciaAsegura } from '@/lib/seguimiento-asegura'
import { colaRecaptacionAsegura } from '@/lib/recaptacion-asegura'

/**
 * Contadores de «Hoy» y de la pestaña Clientes SIN bajarse la lista entera en
 * cada visita (29/09/2026). Medido: cada entrada a /correduria leía ~3.500
 * leads (~1,4 MB) y ~2.200 filas de recaptación (~0,8 MB) de la BD compartida
 * solo para pintar dos números, y eso era la mayor parte del egress del plan
 * Free (5 GB/mes). El número se cachea 5 min en la Data Cache de Vercel
 * (compartida entre instancias); las pantallas que ENSEÑAN la lista siguen
 * pidiéndola fresca.
 *
 * Un fallo NO se cachea: se lanza dentro y el llamador devuelve error, así
 * que el badge sale «—» (no un 0 que tranquiliza) y el siguiente intento
 * vuelve a preguntar.
 */
export const CONTADORES = ['llamadas', 'recaptacion'] as const
export type ContadorCacheado = (typeof CONTADORES)[number]
export const TTL_CONTADOR_S = 300

export function esContador(x: string | null): x is ContadorCacheado {
  return x !== null && (CONTADORES as readonly string[]).includes(x)
}

async function contarSinCache(c: ContadorCacheado): Promise<number> {
  if (c === 'llamadas') {
    const r = await leadsCompetenciaAsegura(90)
    const d = interpretarLeads(r.status, r.json)
    if (d.estado !== 'ok') throw new Error(`leads: ${d.estado}`)
    return colaLlamadas(d.leads).length
  }
  const cola = await colaRecaptacionAsegura()
  if (cola.estado !== 'ok') throw new Error(`recaptacion: ${cola.estado}`)
  return cola.leads.filter((l) => !l.enCooldown).length
}

export async function contadorCacheado(c: ContadorCacheado): Promise<number | null> {
  try {
    return await unstable_cache(() => contarSinCache(c), ['correduria-contador', c], {
      revalidate: TTL_CONTADOR_S,
    })()
  } catch {
    return null
  }
}
