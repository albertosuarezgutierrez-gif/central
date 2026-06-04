// Cliente mínimo de Apify Google Places (compass~crawler-google-places).
// Patrón en 2 fases: startPlacesRun() lanza el run; getRunResults() sondea y
// baja items cuando SUCCEEDED. Sin APIFY_TOKEN, startPlacesRun devuelve null.

const APIFY = 'https://api.apify.com/v2'
const ACTOR = 'compass~crawler-google-places'

export type ApifyVertical = 'catering' | 'eventos' | 'restaurante'

export interface ApifyPlace {
  title?: string
  city?: string
  address?: string
  phone?: string
  phoneUnformatted?: string
  website?: string
  emails?: string[]
  categoryName?: string
  totalScore?: number
}

export function apifyConfigurado(): boolean {
  return !!process.env.APIFY_TOKEN
}

// Lanza un run y devuelve su runId. null si no hay token o falla la llamada.
export async function startPlacesRun(query: string, max: number): Promise<string | null> {
  const token = process.env.APIFY_TOKEN
  if (!token) return null
  try {
    const r = await fetch(`${APIFY}/acts/${ACTOR}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchStringsArray: [query],
        maxCrawledPlacesPerSearch: max,
        language: 'es',
        countryCode: 'es',
        scrapeContacts: true,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!r.ok) return null
    const d = await r.json()
    return d?.data?.id || null
  } catch {
    return null
  }
}

// Sondea un run. Si SUCCEEDED, baja los items del dataset.
export async function getRunResults(
  runId: string
): Promise<{ status: string; datasetId?: string; items?: ApifyPlace[] }> {
  const token = process.env.APIFY_TOKEN
  if (!token) return { status: 'NO_TOKEN' }
  try {
    const r = await fetch(`${APIFY}/actor-runs/${runId}?token=${token}`, {
      signal: AbortSignal.timeout(20000),
    })
    const d = await r.json()
    const status = d?.data?.status as string
    if (status !== 'SUCCEEDED') return { status: status || 'UNKNOWN' }
    const datasetId = d?.data?.defaultDatasetId as string
    const items = (await fetch(
      `${APIFY}/datasets/${datasetId}/items?token=${token}&clean=true&format=json`,
      { signal: AbortSignal.timeout(30000) }
    ).then((x) => x.json())) as ApifyPlace[]
    return { status, datasetId, items: Array.isArray(items) ? items : [] }
  } catch {
    return { status: 'ERROR' }
  }
}
