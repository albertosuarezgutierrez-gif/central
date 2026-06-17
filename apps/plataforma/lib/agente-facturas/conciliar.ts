// Conciliación de importes y mapeo de propiedad. Módulo PURO (sin imports).

// Comprueba que base_imponible + IVA − IRPF ≈ total (los recibos de alquiler
// con retención de IRPF son el caso típico: 303,31 + 63,70 − 57,63 = 309,38).
export function conciliar(
  g: { base_imponible?: number | null; iva?: number | null; irpf?: number | null; total?: number | null },
  tol = 0.05,
): { ok: boolean; esperado: number } {
  const base = Number(g.base_imponible ?? 0)
  const iva = Number(g.iva ?? 0)
  const irpf = Number(g.irpf ?? 0)
  const total = Number(g.total ?? 0)
  if (!base && !total) return { ok: false, esperado: 0 }
  const esperado = +(base + iva - irpf).toFixed(2)
  return { ok: Math.abs(esperado - total) <= tol, esperado }
}

// Mapea el recibo de alquiler de Bustos Tavera 22 a su piso.
export function mapeaPropiedadAlquiler(texto: string): string | null {
  const t = (texto || '').toLowerCase()
  if (!t.includes('bustos tavera')) return null
  if (t.includes('derecha')) return 'prop_luxury_busto'
  if (t.includes('izquierda')) return 'prop_busto_reform'
  return null
}
