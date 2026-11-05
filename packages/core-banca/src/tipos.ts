// Tipos comunes del núcleo bancario. Importes SIEMPRE en céntimos enteros con signo (negativo = cargo, positivo = abono).

export type MovimientoBanco = {
  /** 'YYYY-MM-DD'. */
  fechaOperacion: string
  fechaValor: string
  /** Céntimos con signo: cargo < 0, abono > 0. */
  importe: number
  conceptoComun: string
  /** Texto libre completo del movimiento. */
  concepto: string
  /** Primera línea de concepto (suele ser el nombre de la contraparte). */
  contraparte: string
  referencia: string
  /** Saldo tras el apunte, en céntimos (N43 no lo trae; algunos CSV sí). */
  saldoPosterior?: number
}

export type ExtractoBanco = {
  /** Entidad+oficina+cuenta (18 dígitos) en N43; vacío en CSV (lo da el usuario). */
  ccc: string
  banco: string
  divisa: string
  saldoInicial: number | null
  saldoFinal: number | null
  fechaInicio: string | null
  fechaFin: string | null
  movimientos: MovimientoBanco[]
}

/**
 * PSD2 / Open Banking: SOLO la interfaz. No hay ninguna implementación conectada (requiere TPP/agregador autorizado y consentimiento
 * SCA del cliente cada 90–180 días). Una implementación futura devolverá el mismo `ExtractoBanco` que el N43 y el CSV.
 */
export interface PuertoPsd2 {
  readonly proveedor: string
  /** Movimientos desde `desde` (ISO) de la cuenta enlazada; `null` si el consentimiento caducó (hay que pedir uno nuevo). */
  movimientos(cuentaRef: string, desde: string): Promise<ExtractoBanco | null>
}

/** Implementación nula (por defecto): no hay agregador conectado. */
export const psd2NoConectado: PuertoPsd2 = {
  proveedor: 'ninguno',
  async movimientos() { return null },
}
