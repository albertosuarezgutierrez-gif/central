import { COOKIE_REF_CAMPANA, esRefValido } from '@central/module-seguros'

/**
 * ¿Llega esta persona desde el correo de la campaña «presentación de la app»? (21/10/2026)
 *
 * Sí si trae un `?r=` con FORMA de ref (el primer clic: la cookie aún no existe, la pone el POST a
 * `/api/campana/visita` que dispara `Entrada.tsx`) o si ya tiene la cookie de campaña (recarga, o vuelve
 * días después). Solo mira la forma: no dice si el ref existe en BD ni de quién es, y no devuelve el valor
 * — la bienvenida es la misma para todos y NO lleva ningún dato de la persona (no tenemos su correo aquí).
 */
export function hayMarcaDeCampana(refDeLaUrl: unknown, valorCookie: string | null | undefined): boolean {
  const r = Array.isArray(refDeLaUrl) ? refDeLaUrl[0] : refDeLaUrl
  return esRefValido(r) || esRefValido(valorCookie)
}

export { COOKIE_REF_CAMPANA }

/** Las tres líneas de bienvenida (texto único; el JSX las pinta tal cual). */
export const BIENVENIDA_CAMPANA = [
  'Hola, soy Alberto de Grupo ASegura. Esta es la app de la que te hablé: te aviso antes de que caduque tu seguro o tu ITV, y es gratis.',
  'Tienes todos tus seguros en un sitio, estén donde estén.',
  'Sin contraseñas: pon tu correo aquí abajo y te mando un código.',
] as const
