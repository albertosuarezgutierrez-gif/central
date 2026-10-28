// Festivos nacionales y autonómicos (Andalucía) desde Nager.Date (gratis, sin clave).
// Los LOCALES de Sevilla (Feria, Corpus…) no están aquí: siguen saliendo de la búsqueda web.
// `null` = no se pudo leer ("no se sabe"), NUNCA `[]` ("no hay"): quien llama no debe dar nada por inexistente.

export type FestivoNager = {
  date: string
  localName: string
  name?: string
  global: boolean
  counties: string[] | null
  types?: string[]
}

export type FestivoAndalucia = { fecha: string; nombre: string }

// PURA: global === true o counties incluye "ES-AN".
export function filtrarAndalucia(lista: readonly FestivoNager[]): FestivoAndalucia[] {
  const out: FestivoAndalucia[] = []
  for (const f of lista) {
    if (!f || typeof f.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) continue
    const nombre = (f.localName || f.name || '').trim()
    if (!nombre) continue
    const andalucia = Array.isArray(f.counties) && f.counties.includes('ES-AN')
    if (f.global === true || andalucia) out.push({ fecha: f.date, nombre })
  }
  return out
}

// null si la API falla (red, timeout, HTTP != 200, JSON no es lista).
export async function obtenerFestivosAndalucia(
  anio: number, fetchFn: typeof fetch = fetch,
): Promise<FestivoAndalucia[] | null> {
  try {
    const res = await fetchFn(`https://date.nager.at/api/v3/PublicHolidays/${anio}/ES`, {
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json: unknown = await res.json()
    if (!Array.isArray(json)) return null
    return filtrarAndalucia(json as FestivoNager[])
  } catch {
    return null
  }
}
