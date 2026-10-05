// Casado factura↔cargo bancario, PURO (testeable con `node --test`).
//
// Dos fallos reales de `conciliarConBanco` (auditoría 05/10/2026):
//  1. Anthropic: 3 facturas de 170,00€ con la misma fecha de referencia y 5 cargos exactos de 170€.
//     El SQL elegía «el cargo más cercano» de CADA factura y luego «la factura más cercana» de cada
//     cargo: las tres facturas escogían el MISMO cargo (empate de distancia), dos perdían y quedaban
//     sin casar aunque sobraban cargos libres. Aquí la asignación es global y 1:1.
//  2. Facturas en USD (Vercel, OpenRouter, PriceLabs): el banco carga en EUR al cambio del día, ~12 %
//     menos que el importe de la factura. La tolerancia ±3 % no las casaba nunca.

export const TOLERANCIA_EUR = 0.03
export const TOLERANCIA_DIVISA = 0.15

/** Proveedores que facturan en USD aunque la divisa no se haya guardado (heurística conservadora). */
const RE_USD = /\b(vercel|openrouter|pricelabs|github|openai|cursor|supabase|cloudflare)\b/i

export function toleranciaFactura(proveedor: string | null, divisa: string | null | undefined): number {
  const d = (divisa ?? '').trim().toUpperCase()
  if (d && d !== 'EUR' && d !== '€') return TOLERANCIA_DIVISA
  if (!d && proveedor && RE_USD.test(proveedor)) return TOLERANCIA_DIVISA
  return TOLERANCIA_EUR
}

export interface CandidatoCargo {
  factura_id: string
  movimiento_id: string
  /** Distancia en días entre la fecha de referencia de la factura y el cargo. */
  dist: number
  /** |cargo| / importe de la factura. */
  ratio: number
  tolerancia: number
}

/** Asignación global 1:1: primero los pares más cercanos en fecha y, a igualdad, en importe. */
export function asignarCargos(c: CandidatoCargo[]): { factura_id: string; movimiento_id: string }[] {
  const validos = c
    .filter((x) => Math.abs(x.ratio - 1) <= x.tolerancia)
    .sort((a, b) => a.dist - b.dist || Math.abs(a.ratio - 1) - Math.abs(b.ratio - 1) || a.factura_id.localeCompare(b.factura_id) || a.movimiento_id.localeCompare(b.movimiento_id))
  const f = new Set<string>()
  const m = new Set<string>()
  const out: { factura_id: string; movimiento_id: string }[] = []
  for (const x of validos) {
    if (f.has(x.factura_id) || m.has(x.movimiento_id)) continue
    f.add(x.factura_id); m.add(x.movimiento_id)
    out.push({ factura_id: x.factura_id, movimiento_id: x.movimiento_id })
  }
  return out
}
