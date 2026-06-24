import type { FiscalFields } from './types.ts'

export class FiscalIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FiscalIntegrityError'
  }
}

// Formatea un número fiscal tal y como aparece en el documento: coma decimal, 2 decimales.
export function formatFiscalNumber(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Verifica que todo campo fiscal obligatorio aparece VERBATIM en `rendered`,
 * y que la región de glosa (si se pasa) no contiene ninguna de las cifras fiscales.
 * Falla cerrado: lanza FiscalIntegrityError si algo no cuadra. No emitir sin pasar esto.
 */
export function assertFiscalIntegrity(
  fiscal: FiscalFields,
  rendered: string,
  glosa?: string,
): void {
  const cifras = [
    formatFiscalNumber(fiscal.base),
    formatFiscalNumber(fiscal.iva),
    formatFiscalNumber(fiscal.total),
  ]
  const obligatorios = [fiscal.numero, fiscal.emisorNif, ...cifras]
  if (fiscal.huella) obligatorios.push(fiscal.huella)
  if (fiscal.qrData) obligatorios.push(fiscal.qrData)

  for (const valor of obligatorios) {
    if (!rendered.includes(valor)) {
      throw new FiscalIntegrityError(`Campo fiscal ausente en la salida: "${valor}"`)
    }
  }

  if (glosa) {
    for (const cifra of cifras) {
      if (glosa.includes(cifra)) {
        throw new FiscalIntegrityError(`La glosa contiene una cifra fiscal: "${cifra}"`)
      }
    }
  }
}
