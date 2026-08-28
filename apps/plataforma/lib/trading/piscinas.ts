import type { Tesis } from '@central/module-trading'

// De qué filas salen las stats por estrategia (hipótesis H11, 28/08/2026).
// Módulo PURO y testeado — sin `@/`, sin Prisma, sin red.
//
// Por qué existe: `torneo()` NO aplica el ajuste de confianza a las señales neutrales, pero
// `trading_estrategia_stats` se calcula sobre una piscina que es el 82% neutral — se aprende de lo
// que nunca se toca. Y esas neutrales tienen retorno 0 POR CONSTRUCCIÓN (`puntuarTesis`), así que
// solo pueden hundir el agregado. H11 recolecta las piscinas alternativas EN SOMBRA para poder
// decidir con datos; el torneo sigue leyendo `'todos'` hasta que H11 se resuelva por PR.

/** El valor va a `trading_estrategia_stats.regimen` (único por `(estrategia, regimen)`). */
export type Piscina = 'todos' | 'direccional' | 'alcista'

// 🚨 `'todos'` es la que CONSUME el torneo (`analizar` filtra `regimen: 'todos'`). Las otras dos son
// sombra: se escriben para poder mirarlas, y nadie las lee para decidir. Cambiar eso es cablear H11,
// y eso va por PR con la condición firmada en el pre-registro cumplida.
export const PISCINA_VIVA: Piscina = 'todos'
export const PISCINAS: readonly Piscina[] = ['todos', 'direccional', 'alcista']

/** ¿Entra esta dirección en la piscina? Las bajistas suman en `direccional` porque su retorno ya
 *  viene con el signo invertido de `puntuarTesis` (acertar una caída del 5% anota +5%). */
export function enPiscina(direccion: Tesis['direccion'], piscina: Piscina): boolean {
  if (piscina === 'todos') return true
  if (piscina === 'direccional') return direccion !== 'neutral'
  return direccion === 'alcista'
}
