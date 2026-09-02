import type { Retarificabilidad } from '@central/module-seguros'

/** «Retarificar auto ↗» / «Retarificar hogar ↗»; sin veredicto (asegura vieja), el rótulo de siempre. */
export function rotuloRetarificar(r: Retarificabilidad | null | undefined): string {
  if (r?.ramo === 'auto') return 'Retarificar auto ↗'
  if (r?.ramo === 'hogar') return 'Retarificar hogar ↗'
  return 'Retarificar ↗'
}
