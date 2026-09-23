// Raíles 3-5 de `POST /api/sivra/pricing/aplicar-propuesta` como función PURA (testeable).
//
// 🚨 Hueco que cierra (auditoría pricing 23/09/2026): el tope ±max_change_pct/día (raíl 4) se mide
// contra el precio ACTUAL de Smoobu. Si esa fecha no tiene precio (`old == null`), el raíl no se
// aplicaba y, como ningún piso tiene `max_price`, la propuesta cruda del agente se escribía SIN techo
// — el circuit-breaker tampoco la veía (solo mide fechas con precio previo). Sin referencia no hay
// forma de acotar la subida, así que la fecha NO se escribe salvo que el piso tenga suelo Y techo.
// Estado conservador: dejar el precio base de Smoobu es inocuo; un precio disparatado, no.

export type RailesAjustes = { min_price: number | null; max_price: number | null; max_change_pct: number }

export type RailesResultado =
  | { escribe: false; reason: "sin_referencia" }
  | { escribe: true; target: number; reasons: string[] }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export function aplicarRailesPrecio(p: {
  proposed: number
  old: number | null
  ajustes: RailesAjustes | undefined
}): RailesResultado {
  const s = p.ajustes
  const min = s?.min_price ?? null
  const max = s?.max_price ?? null
  const maxChg = s ? Number(s.max_change_pct) : 0.20

  // Sin precio previo → sin raíl 4. Solo se escribe si suelo y techo acotan la fecha por los dos lados.
  if ((p.old == null || p.old <= 0) && (min == null || max == null)) return { escribe: false, reason: "sin_referencia" }

  let target = p.proposed
  const reasons: string[] = []
  // RAÍL 3 — suelo de coste.
  if (min != null && target < min) { target = min; reasons.push("suelo") }
  // RAÍL 4 — tope ±max_change_pct/día vs precio actual.
  if (p.old != null && p.old > 0) {
    const lo = Math.round(p.old * (1 - maxChg)), hi = Math.round(p.old * (1 + maxChg))
    const capped = clamp(target, lo, hi)
    if (capped !== target) { reasons.push(target > capped ? "tope_subida" : "tope_bajada"); target = capped }
  }
  // RAÍL 5 — techo opcional del propietario (re-aplica suelo por si techo<suelo).
  if (max != null && target > max) { target = max; reasons.push("techo") }
  if (min != null && target < min) target = min
  return { escribe: true, target, reasons }
}
