import type { Tesis } from '@central/module-trading'

// De qué filas salen las stats por estrategia (hipótesis H11, 28/08/2026 — RESUELTA 31/08/2026).
// Módulo PURO y testeado — sin `@/`, sin Prisma, sin red.
//
// Por qué existe: `torneo()` NO aplica el ajuste de confianza a las señales neutrales, pero
// `trading_estrategia_stats` se calculaba sobre una piscina que es el 82% neutral — se aprendía de lo
// que nunca se toca. Y esas neutrales tienen retorno 0 POR CONSTRUCCIÓN (`puntuarTesis`), así que
// solo pueden hundir el agregado. H11 recolectó las piscinas alternativas EN SOMBRA y se resolvió
// por PR con su condición firmada cumplida (las tres): muestra ≥20 en 3 de 4 estrategias
// (momentum 129 · reversión 56 · valor 44), el orden por hit rate cambia (todos: rev>val>mom ·
// direccional: rev>mom>val) y la primera de la piscina nueva no pierde dinero en su piscina alcista.

/** El valor va a `trading_estrategia_stats.regimen` (único por `(estrategia, regimen)`). */
export type Piscina = 'todos' | 'direccional' | 'alcista'

// 🚨 `PISCINA_VIVA` es la que CONSUME el torneo (`analizar` filtra por ella). Las otras dos son
// sombra: se escriben para poder mirarlas, y nadie las lee para decidir. Cambiarla es re-abrir H11:
// va por PR con una condición firmada delante, nunca sobre la marcha.
// `'direccional'` desde el 31/08/2026 (resolución de H11): el torneo aprende de lo que TOCA —
// alcistas + bajistas—, no del 82% neutral que nunca ajusta. `catalizador` (n=5 direccionales)
// queda sin ajuste por `minN` — previsto y firmado: no aprender de ruido.
export const PISCINA_VIVA: Piscina = 'direccional'
export const PISCINAS: readonly Piscina[] = ['todos', 'direccional', 'alcista']

/** ¿Entra esta dirección en la piscina? Las bajistas suman en `direccional` porque su retorno ya
 *  viene con el signo invertido de `puntuarTesis` (acertar una caída del 5% anota +5%). */
export function enPiscina(direccion: Tesis['direccion'], piscina: Piscina): boolean {
  if (piscina === 'todos') return true
  if (piscina === 'direccional') return direccion !== 'neutral'
  return direccion === 'alcista'
}
