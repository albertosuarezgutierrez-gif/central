/**
 * Pedido recomendado a partir de la NECESIDAD (lo que pide la previsión) y un
 * `factor` de holgura aprendido (0.1 = +10% de colchón). Nunca negativo.
 */
export function estimarCompra(necesidad: number, factor: number): number {
  return Math.max(0, Math.round(necesidad * (1 + factor)))
}

export interface AprendizajeCompra {
  estimado: number     // lo que se pidió la vez anterior (necesidad × (1+factorActual))
  real: number         // lo que de verdad se consumió
  factorActual: number // factor con el que se hizo aquel pedido
  suavizado: number    // 0..1: cuánto corrige hacia el factor ideal (1 = de golpe)
}

/**
 * Retroalimenta el factor de holgura comparando lo pedido (estimado) con lo
 * consumido (real). Si sobró producto, el factor baja; si faltó, sube. El
 * `suavizado` evita dar bandazos: corrige solo una fracción hacia el ideal.
 */
export function aprenderFactor({ estimado, real, factorActual, suavizado }: AprendizajeCompra): number {
  const necesidad = estimado / (1 + factorActual)
  if (necesidad <= 0) return factorActual
  const factorIdeal = real / necesidad - 1
  return factorActual + suavizado * (factorIdeal - factorActual)
}
