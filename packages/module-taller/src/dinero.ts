// Dinero en CÉNTIMOS ENTEROS. Nada de floats con euros: el redondeo se hace una vez, en entero.

/** División entera redondeando a la mitad hacia fuera del cero (0,5 céntimos → 1). Exige enteros y d > 0. */
export function dividirRedondeando(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) {
    throw new RangeError(`dividirRedondeando: operandos no enteros o divisor ≤ 0 (${n}/${d})`)
  }
  const signo = n < 0 ? -1 : 1
  const a = Math.abs(n)
  const q = Math.floor((2 * a + d) / (2 * d))
  return signo * q
}

/** Formato español: `2.162,49€` (punto de miles también con 4 cifras, coma decimal, € detrás). */
export function formatearEur(cent: number): string {
  if (!Number.isSafeInteger(cent)) throw new RangeError(`formatearEur: ${cent} no es un entero de céntimos`)
  const signo = cent < 0 ? '-' : ''
  const abs = Math.abs(cent)
  const euros = Math.floor(abs / 100)
  const resto = abs % 100
  const miles = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}${miles},${String(resto).padStart(2, '0')}€`
}
