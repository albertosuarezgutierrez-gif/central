// La cuenta de `/calculadora-bonificacion-hipoteca`: cuánto cuesta DE VERDAD el
// seguro que vende el banco cuando a cambio rebaja el tipo de la hipoteca.
//
//   bonificación ≈ capital pendiente × puntos / 100   (lo que el banco deja de cobrarte al año)
//   coste real   = lo que te cobra por el seguro − bonificación
//
// Es una aproximación del PRIMER año: el capital baja con cada cuota, así que
// la bonificación de los años siguientes es menor. La página lo dice.
//
// 🚨 Tres estados, no dos: con un dato sin poner no hay resultado (`null`), y
// la UI no pinta «0€» — pinta que falta el dato. Un coste real negativo no se
// esconde tras un `max(0, …)`: significa que la bonificación vale más que el
// seguro, y eso es justo lo que la persona necesita saber.

export type EntradaBonificacion = {
  /** Capital pendiente de la hipoteca, en €. */
  capital: string
  /** Puntos de bonificación del tipo por ese seguro (0,50 = 0,50 %). Admite coma. */
  puntos: string
  /** Lo que el banco cobra por ese seguro al año, en €. */
  prima: string
}

export type ResultadoBonificacion = {
  prima: number
  bonificacion: number
  costeReal: number
  /** true si la bonificación vale más que el seguro: sale a cuenta quedárselo. */
  compensa: boolean
}

/** «0,5» o «0.5» → 0.5; «40.000» (miles con punto) → 40000. `null` si no es un número ≥ 0. */
export function leerNumero(txt: string): number | null {
  const limpio = txt.trim().replace(/\s|€|%/g, '')
  if (!limpio) return null
  // Un punto seguido de exactamente 3 cifras es separador de miles (40.000); si no, decimal.
  const normal = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(',', '.')
  const n = Number(normal)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function calcularBonificacion(e: EntradaBonificacion): ResultadoBonificacion | null {
  const capital = leerNumero(e.capital)
  const puntos = leerNumero(e.puntos)
  const prima = leerNumero(e.prima)
  if (capital === null || puntos === null || prima === null) return null
  const bonificacion = redondear((capital * puntos) / 100)
  const costeReal = redondear(prima - bonificacion)
  return { prima, bonificacion, costeReal, compensa: costeReal < 0 }
}

const redondear = (n: number) => Math.round(n * 100) / 100
