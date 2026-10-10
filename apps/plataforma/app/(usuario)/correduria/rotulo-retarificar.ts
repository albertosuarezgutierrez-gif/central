import type { Retarificabilidad } from '@central/module-seguros'

/**
 * El rótulo del enlace de retarificar — y **la flecha ↗ solo donde de verdad se
 * sale de plataforma**.
 *
 * Auto (03/09/2026), moto y hogar (17/09/2026) se retarifican DENTRO de `/correduria`
 * (`urlRetarificar()` devuelve la ruta interna para todas), así que ninguna lleva ↗: la flecha
 * prometería un salto de dominio que ya no ocurre (quitada en hogar el 29/09/2026).
 *
 * Sin veredicto (`null`: una versión de asegura anterior al helper) no se sabe a
 * dónde lleva el enlace, así que se conserva la flecha: prometer que uno se
 * queda en la pantalla y acabar en un login es peor que avisar de más.
 */
export function rotuloRetarificar(r: Retarificabilidad | null | undefined): string {
  if (r?.ramo === 'auto') return 'Retarificar auto'
  if (r?.ramo === 'moto') return 'Retarificar moto'
  if (r?.ramo === 'hogar') return 'Retarificar hogar'
  return 'Retarificar ↗'
}
