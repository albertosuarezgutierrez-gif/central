// lib/seo-correduria/gsc.ts — lectura de Google Search Console (Search Analytics API).
//
// Ventana de 7 días cerrada 3 días antes de hoy: GSC publica con ~2-3 días de retraso y los
// últimos días vendrían incompletos (parecerían «bajadas»). Se comparan dos semanas enteras.
// `fetch` se inyecta (FetchLike) para que los tests no toquen la red.

import type { DatosGsc, FetchLike, FilaGsc, TotalGsc, VentanaGsc } from './tipos.ts'

export const GSC_API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3/sites'
const ROW_LIMIT = 250
const DIA_MS = 86_400_000

function fechaUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Ventana actual = [hoy−9, hoy−3] (7 días inclusive); anterior = los 7 días justo antes. UTC. */
export function ventanas(hoy: Date): { actual: VentanaGsc; anterior: VentanaGsc } {
  const medianoche = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  const hasta = medianoche - 3 * DIA_MS
  const desde = hasta - 6 * DIA_MS
  const hastaAnt = desde - DIA_MS
  const desdeAnt = hastaAnt - 6 * DIA_MS
  return {
    actual: { desde: fechaUtc(desde), hasta: fechaUtc(hasta) },
    anterior: { desde: fechaUtc(desdeAnt), hasta: fechaUtc(hastaAnt) },
  }
}

type FilaApi = { keys?: unknown[]; clicks?: number; impressions?: number; ctr?: number; position?: number }

/** Una consulta a searchAnalytics/query por dimensión. Sin `rows` en la respuesta → `[]`. */
export async function consultarGsc(
  token: string,
  propiedad: string,
  ventana: VentanaGsc,
  dimension: 'query' | 'page',
  fetch: FetchLike,
): Promise<FilaGsc[]> {
  const url = `${GSC_API_BASE}/${encodeURIComponent(propiedad)}/searchAnalytics/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: ventana.desde,
      endDate: ventana.hasta,
      dimensions: [dimension],
      rowLimit: ROW_LIMIT,
    }),
  })
  const cuerpo = await res.text()
  if (!res.ok) throw new Error(`gsc ${dimension} ${res.status}: ${cuerpo.slice(0, 200)}`)

  const json = JSON.parse(cuerpo) as { rows?: FilaApi[] }
  if (!Array.isArray(json.rows)) return []
  return json.rows.map(r => ({
    clave: String(r.keys?.[0] ?? ''),
    clics: Number(r.clicks ?? 0),
    impresiones: Number(r.impressions ?? 0),
    ctr: Number(r.ctr ?? 0),
    posicion: Number(r.position ?? 0),
  }))
}

/**
 * Suma clics e impresiones; `ctr` = clics/impresiones (0 si no hay impresiones);
 * `posicion` = media ponderada por impresiones, y **null** si no hay impresiones:
 * «posición 0» sería un dato (el mejor posible), no una ausencia.
 */
export function totalizar(filas: FilaGsc[]): TotalGsc {
  let clics = 0
  let impresiones = 0
  let sumaPos = 0
  for (const f of filas) {
    clics += f.clics
    impresiones += f.impresiones
    sumaPos += f.posicion * f.impresiones
  }
  return {
    clics,
    impresiones,
    ctr: impresiones > 0 ? clics / impresiones : 0,
    posicion: impresiones > 0 ? sumaPos / impresiones : null,
  }
}

/**
 * Consultas + páginas de la semana actual y solo el total de la anterior.
 * Si la anterior falla, `anterior: null` — no se tira la semana actual por perder el delta.
 */
export async function leerGsc(
  cfg: { token: string; propiedad: string; hoy?: Date },
  fetch: FetchLike,
): Promise<DatosGsc> {
  const v = ventanas(cfg.hoy ?? new Date())
  const consultas = await consultarGsc(cfg.token, cfg.propiedad, v.actual, 'query', fetch)
  const paginas = await consultarGsc(cfg.token, cfg.propiedad, v.actual, 'page', fetch)

  let anterior: DatosGsc['anterior'] = null
  try {
    const filasAnt = await consultarGsc(cfg.token, cfg.propiedad, v.anterior, 'query', fetch)
    anterior = { ventana: v.anterior, total: totalizar(filasAnt) }
  } catch {
    anterior = null
  }

  return {
    actual: { ventana: v.actual, total: totalizar(consultas), consultas, paginas },
    anterior,
  }
}
