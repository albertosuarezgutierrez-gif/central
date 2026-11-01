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
// Un reintento tras un fallo transitorio (red/timeout/5xx/429): Nager cae a ratos y el cron es diario.
// Un 4xx (p. ej. 404 de un año aún no publicado) no se reintenta: no cambiará en un segundo.
export async function obtenerFestivosAndalucia(
  anio: number, fetchFn: typeof fetch = fetch, reintentos = 1, esperaMs = 1_000,
): Promise<FestivoAndalucia[] | null> {
  for (let intento = 0; intento <= reintentos; intento++) {
    let transitorio = true
    try {
      const res = await fetchFn(`https://date.nager.at/api/v3/PublicHolidays/${anio}/ES`, {
        signal: AbortSignal.timeout(8_000),
        cache: 'no-store',
      })
      if (res.ok) {
        const json: unknown = await res.json()
        if (!Array.isArray(json)) return null
        return filtrarAndalucia(json as FestivoNager[])
      }
      transitorio = res.status >= 500 || res.status === 429
    } catch {
      // red / timeout: transitorio
    }
    if (!transitorio || intento === reintentos) return null
    if (esperaMs > 0) await new Promise(r => setTimeout(r, esperaMs))
  }
  return null
}

// PURA: fechas (YYYY-MM-DD, únicas, ordenadas) en las que un festivo de Nager dentro de [desde, hasta]
// ya cubre el día, de modo que un festivo `websearch` de esa MISMA fecha es un duplicado.
// `null` (API caída) o lista vacía -> [] : sin datos de Nager no se da nada por duplicado.
// Los festivos locales (fechas que Nager no tiene) nunca salen de aquí.
export function fechasADeduplicar(
  festivosNager: readonly FestivoAndalucia[] | null | undefined, desde: string, hasta: string,
): string[] {
  if (!Array.isArray(festivosNager)) return []
  const set = new Set<string>()
  for (const f of festivosNager) {
    if (!f || typeof f.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) continue
    if (f.fecha < desde || f.fecha > hasta) continue
    set.add(f.fecha)
  }
  return [...set].sort()
}
