// lib/seo-correduria/cobertura.ts — indexación REAL de las páginas propias (URL Inspection API).
//
// gsc.ts (Search Analytics) dice CÓMO rinde una página que YA está en el índice; esto dice si una
// página SIGUE en el índice — es la única API de Google para «¿esta URL da 404 / se cayó del
// índice / la bloquea robots?». La API pública no expone el informe de Cobertura en bloque: es
// per-URL (`urlInspection/index:inspect`), por eso se acota a las páginas propias que ya cubren
// intención de compra (`consultas.ts`) y no a un rastreo del sitio entero. Reusa el MISMO token de
// cuenta de servicio que gsc.ts (mismo scope de Search Console): no hace falta un secreto nuevo.
//
// `fetch` se inyecta (FetchLike) para que los tests no toquen la red.

import type { DatosCobertura, FetchLike, FilaCobertura, VerdictoCobertura } from './tipos.ts'

export const URL_INSPECTION_API = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const PRESUPUESTO_MS_DEFECTO = 20_000

const VERDICTOS: readonly string[] = ['PASS', 'PARTIAL', 'FAIL', 'NEUTRAL']

function verdicto(v: unknown): VerdictoCobertura {
  return typeof v === 'string' && VERDICTOS.includes(v) ? (v as VerdictoCobertura) : 'DESCONOCIDO'
}

type RespuestaApi = {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string
      coverageState?: string
      robotsTxtState?: string
      indexingState?: string
      pageFetchState?: string
      lastCrawlTime?: string
      googleCanonical?: string
      userCanonical?: string
    }
  }
}

/** Las rutas ÚNICAS que `consultas.ts` ya cita como página objetivo, como URLs completas. */
export function urlsPropias(consultas: { pagina: string | null }[], dominio: string): string[] {
  const rutas = new Set<string>()
  for (const c of consultas) if (c.pagina) rutas.add(c.pagina)
  return [...rutas].sort().map(ruta => `https://${dominio}${ruta}`)
}

/**
 * Inspecciona UNA url. Nunca lanza: un fallo de red o un cuerpo inesperado se declara en la fila
 * (`estado:'error'`) para que una URL rota no tumbe el resto del lote — es el mismo criterio que
 * `leerGsc` aplica a la semana anterior.
 */
export async function inspeccionarUrl(
  token: string,
  propiedad: string,
  url: string,
  fetch: FetchLike,
): Promise<FilaCobertura> {
  try {
    const res = await fetch(URL_INSPECTION_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: propiedad }),
    })
    const cuerpo = await res.text()
    if (!res.ok) return { url, estado: 'error', detalle: `${res.status}: ${cuerpo.slice(0, 200)}` }

    const json = JSON.parse(cuerpo) as RespuestaApi
    const r = json.inspectionResult?.indexStatusResult
    if (!r) return { url, estado: 'error', detalle: 'respuesta sin indexStatusResult' }

    return {
      url,
      estado: 'ok',
      verdicto: verdicto(r.verdict),
      cobertura: r.coverageState ?? null,
      indexacion: r.indexingState ?? null,
      robotsTxt: r.robotsTxtState ?? null,
      rastreoPagina: r.pageFetchState ?? null,
      ultimoRastreo: r.lastCrawlTime ?? null,
      canonicalGoogle: r.googleCanonical ?? null,
      canonicalUsuario: r.userCanonical ?? null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { url, estado: 'error', detalle: msg.slice(0, 200) }
  }
}

/**
 * Inspecciona una lista de URLs EN SERIE — la API no ofrece lote — dentro de un presupuesto de
 * tiempo (el cron reparte `maxDuration` entre GSC/PostHog/esto). Lo que no llega a tiempo se
 * declara `error:'sin tiempo'`, nunca se omite en silencio: una URL ausente de la lista se leería
 * como «no hacía falta comprobarla».
 */
export async function leerCobertura(
  cfg: { token: string; propiedad: string; urls: string[]; presupuestoMs?: number },
  fetch: FetchLike,
): Promise<DatosCobertura> {
  const inicio = Date.now()
  const presupuesto = cfg.presupuestoMs ?? PRESUPUESTO_MS_DEFECTO
  const paginas: FilaCobertura[] = []
  for (const url of cfg.urls) {
    if (Date.now() - inicio > presupuesto) {
      paginas.push({ url, estado: 'error', detalle: 'sin tiempo: presupuesto del cron agotado' })
      continue
    }
    paginas.push(await inspeccionarUrl(cfg.token, cfg.propiedad, url, fetch))
  }
  return { paginas }
}
