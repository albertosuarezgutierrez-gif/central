// lib/seo-correduria/posthog.ts — tráfico de la web de la correduría, vía HogQL de PostHog.
//
// POST `${host}/api/projects/${projectId}/query` con `Authorization: Bearer <personal API key>`
// y `{ query: { kind: 'HogQLQuery', query } }`. Devuelve `results` como array de filas (arrays).
// Las filas con ruta/dominio null se descartan: una fila «null» no es una página ni un origen.
// Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md

import type { DatosPosthog, FetchLike } from './tipos.ts'

export type ConfigPosthog = { apiKey: string; projectId: string; host: string }

export async function hogql(cfg: ConfigPosthog, query: string, fetch: FetchLike): Promise<unknown[][]> {
  const host = cfg.host.replace(/\/+$/, '')
  const res = await fetch(`${host}/api/projects/${cfg.projectId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    throw new Error(`PostHog ${res.status}${cuerpo ? `: ${cuerpo.slice(0, 160)}` : ''}`)
  }
  const data = (await res.json()) as { results?: unknown }
  return Array.isArray(data.results) ? (data.results as unknown[][]) : []
}

function entero(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export async function leerPosthog(cfg: ConfigPosthog, fetch: FetchLike, dias = 7): Promise<DatosPosthog> {
  const ventana = `event = '$pageview' AND timestamp > now() - INTERVAL ${dias} DAY`

  const totales = await hogql(cfg, `SELECT count(), count(DISTINCT person_id) FROM events WHERE ${ventana}`, fetch)
  const rutas = await hogql(
    cfg,
    `SELECT properties.$pathname, count() FROM events WHERE ${ventana} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    fetch,
  )
  const referentes = await hogql(
    cfg,
    `SELECT properties.$referring_domain, count(DISTINCT $session_id) FROM events WHERE ${ventana} AND properties.$referring_domain IS NOT NULL AND properties.$referring_domain != '$direct' GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    fetch,
  )

  const fila0 = totales[0] ?? []
  return {
    dias,
    paginasVistas: entero(fila0[0]),
    visitantes: entero(fila0[1]),
    topPaginas: rutas
      .filter(f => typeof f[0] === 'string' && f[0] !== '')
      .map(f => ({ ruta: f[0] as string, vistas: entero(f[1]) })),
    origenes: referentes
      .filter(f => typeof f[0] === 'string' && f[0] !== '')
      .map(f => ({ dominio: f[0] as string, sesiones: entero(f[1]) })),
  }
}
