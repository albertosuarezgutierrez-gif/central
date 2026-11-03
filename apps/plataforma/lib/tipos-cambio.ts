// apps/plataforma/lib/tipos-cambio.ts
// Tipos de cambio del BCE vía Frankfurter (API pública, sin clave). rate = unidades de divisa por 1 EUR,
// así que EUR = importe / rate. Regla del repo: dato que NO hay ≠ 0 → sin tipo, el resultado es `null`.

export type TiposBCE = { fecha: string; rates: Record<string, number> }

const URL_BCE = 'https://api.frankfurter.dev/v1/latest?base=EUR'

/** Server-side. Caché de un día; `null` si la API falla o responde algo inesperado (nunca lanza). */
export async function obtenerTiposBCE(): Promise<TiposBCE | null> {
  try {
    const r = await fetch(URL_BCE, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    return parsearTiposBCE(await r.json())
  } catch {
    return null
  }
}

export function parsearTiposBCE(j: unknown): TiposBCE | null {
  const o = j as { date?: unknown; rates?: unknown } | null
  if (!o || typeof o.date !== 'string' || !o.rates || typeof o.rates !== 'object') return null
  const rates: Record<string, number> = {}
  for (const [k, v] of Object.entries(o.rates as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) rates[k.toUpperCase()] = v
  }
  return { fecha: o.date, rates }
}

/** Importe → euros. EUR tal cual; divisa sin tipo, tipos null o importe no finito → null (nunca 0). */
export function aEuros(importe: number | null, divisa: string, tipos: TiposBCE | null): number | null {
  if (importe == null || !Number.isFinite(importe)) return null
  const d = divisa.toUpperCase()
  if (d === 'EUR') return importe
  const rate = tipos?.rates[d]
  if (rate == null || !(rate > 0)) return null
  return Math.round((importe / rate) * 100) / 100
}

export type TotalEur = { total: number; minimo: boolean; fecha: string | null }

/**
 * Suma de los valores por divisa en €. null si alguna divisa no se puede convertir o su valor es null.
 * `minimo` = alguna divisa tiene precios que faltan (completo=false): el total es un suelo.
 */
export function totalEnEuros(
  porDivisa: { divisa: string; valor: number | null; completo: boolean }[],
  tipos: TiposBCE | null,
): TotalEur | null {
  if (porDivisa.length === 0) return null
  let total = 0
  for (const d of porDivisa) {
    const e = aEuros(d.valor, d.divisa, tipos)
    if (e == null) return null
    total += e
  }
  const hayNoEur = porDivisa.some(d => d.divisa.toUpperCase() !== 'EUR')
  return {
    total: Math.round(total * 100) / 100,
    minimo: porDivisa.some(d => !d.completo),
    fecha: hayNoEur ? tipos?.fecha ?? null : null,
  }
}
