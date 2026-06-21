// Cálculo de IVA — universal (no atado a jurisdicción).

/**
 * Descompone un importe CON IVA en base imponible + cuota.
 * `tipoIva` en puntos porcentuales (10 = 10%). Redondeo a 2 decimales.
 */
export function calcularFiscal(importeConIva: number, tipoIva = 10): {
  base_imponible: number
  cuota_iva: number
  tipo_iva: number
} {
  const base = importeConIva / (1 + tipoIva / 100)
  return {
    base_imponible: Math.round(base * 100) / 100,
    cuota_iva: Math.round((importeConIva - base) * 100) / 100,
    tipo_iva: tipoIva,
  }
}
