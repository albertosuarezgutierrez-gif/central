// Dinero en CÉNTIMOS ENTEROS. Nunca floats en el núcleo de doble partida.
// `Centimos` es un number que DEBE ser entero seguro; se valida en las fronteras.

export type Centimos = number

export class ErrorContable extends Error {
  readonly codigo: string
  constructor(codigo: string, mensaje: string) {
    super(mensaje)
    this.name = 'ErrorContable'
    this.codigo = codigo
  }
}

export function esCentimos(n: unknown): n is Centimos {
  return typeof n === 'number' && Number.isSafeInteger(n)
}

/** Lanza si `n` no es un entero seguro. Devuelve el mismo valor (tipado). */
export function validarCentimos(n: unknown, etiqueta = 'importe'): Centimos {
  if (!esCentimos(n)) throw new ErrorContable('importe_no_entero', `${etiqueta} debe ser un entero en céntimos (recibido: ${String(n)})`)
  return n
}

/** Euros (decimal) → céntimos, redondeando al céntimo más próximo (mitades hacia fuera). */
export function aCentimos(euros: number): Centimos {
  if (!Number.isFinite(euros)) throw new ErrorContable('importe_no_finito', `importe no finito: ${String(euros)}`)
  const c = Math.sign(euros) * Math.round(Math.abs(euros) * 100 + 1e-9)
  return c === 0 ? 0 : c
}

/** Céntimos → euros decimales (solo para interoperar con el código antiguo basado en floats). */
export function aEuros(c: Centimos): number {
  return validarCentimos(c) / 100
}

/** Formato español: 216249 → «2.162,49€» (miles con punto también en 4 cifras; coma decimal; € detrás). */
export function formatearCentimos(c: Centimos): string {
  validarCentimos(c)
  const neg = c < 0
  const abs = Math.abs(c)
  const enteros = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const dec = String(abs % 100).padStart(2, '0')
  return `${neg ? '-' : ''}${enteros},${dec}€`
}

/** Cuota de IVA (o cualquier porcentaje) sobre una base en céntimos, redondeo al céntimo. */
export function porcentajeDe(base: Centimos, porcentaje: number): Centimos {
  validarCentimos(base, 'base')
  const c = Math.sign(base) * Math.round(Math.abs(base) * porcentaje / 100 + 1e-9)
  return c === 0 ? 0 : c
}
