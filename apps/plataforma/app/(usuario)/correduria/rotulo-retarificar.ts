import type { Retarificabilidad } from '@central/module-seguros'

/**
 * El rótulo del enlace de retarificar — y **la flecha ↗ solo donde de verdad se
 * sale de plataforma**.
 *
 * Desde el 03/09/2026 auto se retarifica DENTRO de `/correduria`
 * (`urlRetarificar()` devuelve la ruta interna), así que su ↗ mentía: prometía
 * un salto de dominio que ya no ocurre. Hogar sigue saltando a `apps/asegura`
 * —su pantalla pide m², año, capitales y el Catastro del riesgo, y no está
 * portada— y esa flecha se queda porque avisa de lo que va a pasar: otro
 * dominio, otra sesión, y puede pedir contraseña.
 *
 * Sin veredicto (`null`: una versión de asegura anterior al helper) no se sabe a
 * dónde lleva el enlace, así que se conserva la flecha: prometer que uno se
 * queda en la pantalla y acabar en un login es peor que avisar de más.
 */
export function rotuloRetarificar(r: Retarificabilidad | null | undefined): string {
  if (r?.ramo === 'auto') return 'Retarificar auto'
  if (r?.ramo === 'hogar') return 'Retarificar hogar ↗'
  return 'Retarificar ↗'
}
