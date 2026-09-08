// lib/seo-correduria/serp.ts — top-10 de Google por consulta, vía Serper.
//
// Mismo cliente que `app/api/sivra/mercado/search/route.ts` (header `X-API-KEY`, `gl:'es'`,
// `hl:'es'`, `num:10`, timeout de 10 s). En `!res.ok` el cuerpo va en el error a propósito: es
// donde Serper dice «Not enough credits», y un «400» pelado costó dos días en agosto de 2026.
//
// Las consultas van EN SERIE (no `Promise.all`): son ~14 llamadas contra una cuenta con pocos
// créditos, y una ráfaga es la forma más rápida de agotarlos. Si UNA falla, se propaga: mejor un
// `error` entero que un top-10 a medias que parezca completo (regla «dato que NO hay ≠ dato que NO
// se ha mirado»).
// Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md

import type { ConsultaSerp, DatosSerp, FetchLike, ResultadoSerp } from './tipos.ts'

const SERPER_URL = 'https://google.serper.dev/search'
const MAX_RESULTADOS = 10

/** Hostname de la URL sin el `www.` inicial. Si no parsea, devuelve la cadena tal cual en minúsculas. */
export function dominioDe(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.startsWith('www.') ? host.slice(4) : host
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Posición del primer resultado del dominio propio (o de un subdominio suyo, `.${dominio}`).
 * `null` = no está en el top: NO es la posición 0, y el informe tiene que poder decir «no aparece».
 * `grupoasegura.es.otro.com` NO cuenta como propio: el sufijo se compara con el punto delante.
 */
export function posicionPropia(top: ResultadoSerp[], dominio: string): number | null {
  const propio = dominioDe(dominio)
  const sufijo = `.${propio}`
  for (const r of top) {
    const d = dominioDe(r.dominio)
    if (d === propio || d.endsWith(sufijo)) return r.posicion
  }
  return null
}

export async function consultarSerp(apiKey: string, consulta: string, fetch: FetchLike): Promise<ResultadoSerp[]> {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: consulta, gl: 'es', hl: 'es', num: MAX_RESULTADOS }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    throw new Error(`Serper ${res.status}${cuerpo ? `: ${cuerpo.slice(0, 120)}` : ''}`)
  }
  const data = (await res.json()) as { organic?: unknown }
  const organic = Array.isArray(data.organic) ? (data.organic as Record<string, unknown>[]) : []
  return organic.slice(0, MAX_RESULTADOS).map((r, i) => {
    const link = typeof r.link === 'string' ? r.link : ''
    return {
      posicion: typeof r.position === 'number' ? r.position : i + 1,
      dominio: dominioDe(link),
      url: link,
      titulo: typeof r.title === 'string' ? r.title : '',
    }
  })
}

export async function leerSerp(
  cfg: { apiKey: string; dominio: string; consultas: { consulta: string; pagina: string | null }[] },
  fetch: FetchLike,
): Promise<DatosSerp> {
  const consultas: ConsultaSerp[] = []
  for (const c of cfg.consultas) {
    const top = await consultarSerp(cfg.apiKey, c.consulta, fetch)
    consultas.push({ consulta: c.consulta, pagina: c.pagina, top, propia: posicionPropia(top, cfg.dominio) })
  }
  return { dominio: cfg.dominio, consultas }
}
