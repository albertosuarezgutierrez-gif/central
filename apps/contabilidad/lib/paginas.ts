// Paginación «~50 + Ver más» (regla de rendimiento UI): nunca cientos de filas de golpe. PURO.
export const PASO = 50
export const MAXIMO = 1000

/** `?n=` → número de filas a mostrar: múltiplo de 50 entre 50 y 1000. Cualquier otra cosa → 50. */
export function limiteDe(v: unknown): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  if (!Number.isInteger(n) || n < PASO) return PASO
  return Math.min(MAXIMO, Math.ceil(n / PASO) * PASO)
}
