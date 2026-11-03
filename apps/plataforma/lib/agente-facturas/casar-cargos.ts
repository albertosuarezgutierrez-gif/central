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

// ── Facturas que se cobran con TARJETA (Fly.io, Vercel…) ─────────────────────────────────────────
// El feed PSD2 de la tarjeta está parado: el extracto se sube a mano. La casación es más estricta que
// la genérica (ventana de fechas corta, tolerancia ±3 % sobre el importe CONVERTIDO) y se usa solo
// para facturas ya clasificadas como «se cobra con tarjeta» (ver `tarjeta.ts`). No toca el
// comportamiento de EUR de `toleranciaFactura`/`asignarCargos`.

/** Banda sobre el importe convertido cuando el tipo de cambio es conocido (guardado en la factura). */
export const TOLERANCIA_TARJETA = 0.03
/**
 * Banda cuando el cambio es APROXIMADO (no hay tipo guardado): el cargo de la tarjeta usa el cambio del
 * día + comisión del emisor, que no conocemos. ±3 % sobre un cambio estimado daría falsos «sin casar»;
 * se ensancha a ±8 % (el resto de guardas —clave de proveedor, ventana de 13 días, 1:1— acotan el riesgo).
 */
export const TOLERANCIA_TARJETA_CAMBIO_APROX = 0.08
/** Cambio aproximado a EUR (1 unidad de divisa = X EUR). Observado: Vercel 106,76 USD → 95,44 € (0,894). */
export const CAMBIO_APROX_A_EUR: Record<string, number> = { USD: 0.89, GBP: 1.15, CHF: 1.05 }
/** Ventana de fecha del cargo respecto a la fecha de la factura: [−3, +10] días. */
export const VENTANA_CARGO_ANTES = 3
export const VENTANA_CARGO_DESPUES = 10

export function enVentanaCargo(diasDesdeFactura: number): boolean {
  return diasDesdeFactura >= -VENTANA_CARGO_ANTES && diasDesdeFactura <= VENTANA_CARGO_DESPUES
}

/**
 * Ratio cargo/esperado y tolerancia para una factura de tarjeta. `divisa` null/vacía/EUR = EUR (la divisa
 * desconocida de un proveedor en USD la resuelve quien llama con `divisaEfectiva`). Divisa extranjera sin
 * cambio guardado ni aproximado → null (no se casa: no se inventa un cambio).
 */
export function ratioTarjeta(
  importe: number, divisa: string | null | undefined, cargoAbs: number, cambio?: number | null,
): { ratio: number; tolerancia: number } | null {
  if (!(importe > 0)) return null
  const d = (divisa ?? '').trim().toUpperCase()
  if (!d || d === 'EUR' || d === '€') return { ratio: cargoAbs / importe, tolerancia: TOLERANCIA_EUR }
  if (cambio && cambio > 0) return { ratio: cargoAbs / (importe * cambio), tolerancia: TOLERANCIA_TARJETA }
  const aprox = CAMBIO_APROX_A_EUR[d]
  if (!aprox) return null
  return { ratio: cargoAbs / (importe * aprox), tolerancia: TOLERANCIA_TARJETA_CAMBIO_APROX }
}
