// apps/plataforma/lib/devolucion-aeat.ts
// Abonos de la AEAT (devolución de IRPF/IVA…): no son ingreso del negocio. Módulo PURO (`node --test`).

// Patrón SQL equivalente a esDevolucionAeat: finanzas.ts lo usa también sobre movimientos antiguos
// sin recategorizar en BD.
export const REGEX_DEVOLUCION_AEAT = '\\mAEAT\\M|AGENCIA\\s+TRIBUTARIA|DEVOLUCION\\s+(DE\\s+)?(IRPF|RENTA|IVA|TRIBUT)|HACIENDA\\s+P[UÚ]BLICA'
const RE_DEV_AEAT = /\bAEAT\b|AGENCIA\s+TRIBUTARIA|DEVOLUCION\s+(DE\s+)?(IRPF|RENTA|IVA|TRIBUT)|HACIENDA\s+P[UÚ]BLICA/i

// importe > 0 y concepto inequívoco del fisco.
export function esDevolucionAeat(concepto: string | null | undefined, importe: number): boolean {
  if (!(importe > 0)) return false
  return RE_DEV_AEAT.test(concepto ?? '')
}
