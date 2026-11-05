/**
 * Dinero en CÉNTIMOS ENTEROS y tipos en PARTES POR MILLÓN (ppm) — sin floats en el motor.
 *   4,70 %  → 47_000 ppm      ·   0,15 % → 1_500 ppm      ·   1.800,00 € → 180_000 céntimos
 * Una cuota = round(base × ppm / 1_000_000): UN redondeo por línea (medio céntimo hacia arriba), como la TGSS.
 * Rango: base máx. 510_120 c × 283_000 ppm ≈ 1,4e11 < 2^53 → la multiplicación es exacta.
 */
export type Centimos = number
export type Ppm = number

export function esCentimos(n: number): boolean {
  return Number.isSafeInteger(n)
}

/** Euros (lo que guarda la BD como NUMERIC) → céntimos. `toPrecision` evita el 1,005 × 100 = 100,4999…. */
export function eurosACentimos(euros: number): Centimos {
  if (!Number.isFinite(euros)) throw new Error(`Importe no numérico: ${euros}`)
  return Math.round(Number((euros * 100).toPrecision(15)))
}

export function centimosAEuros(c: Centimos): number {
  return c / 100
}

/** Porcentaje humano (4.7 = 4,70 %) → ppm. */
export function pctAPpm(pct: number): Ppm {
  if (!Number.isFinite(pct)) throw new Error(`Porcentaje no numérico: ${pct}`)
  return Math.round(Number((pct * 10_000).toPrecision(15)))
}

/** Fracción (0.0155 = 1,55 %) → ppm. Para `empresas.at_ep_tipo`, que se guarda como fracción. */
export function fraccionAPpm(f: number): Ppm {
  if (!Number.isFinite(f)) throw new Error(`Tipo no numérico: ${f}`)
  return Math.round(Number((f * 1_000_000).toPrecision(15)))
}

/** Cuota = base × tipo, redondeada al céntimo (medio céntimo hacia arriba; las bases son ≥ 0). */
export function aplicarTipo(base: Centimos, tipo: Ppm): Centimos {
  if (!esCentimos(base) || !Number.isSafeInteger(tipo)) throw new Error('aplicarTipo exige enteros (céntimos y ppm)')
  return Math.round((base * tipo) / 1_000_000)
}
