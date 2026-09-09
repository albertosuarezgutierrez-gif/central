import { cookies } from 'next/headers'

import { COOKIE_NAME, verificarSesion } from '@/lib/auth'

import { InstalarBoton } from './InstalarBoton'

/**
 * El botón de instalar, solo si HAY sesión.
 *
 * Misma regla que `SalirDelPortal` y `CampanaAvisos`: se comprueba VERIFICANDO
 * el token, no viendo que la cookie existe. Y dentro de la sesión y no en la
 * puerta: pedirle instalar a quien todavía no ha metido el código es ruido, y
 * la portada la ve también quien llega por error.
 *
 * No toca la BD: `verificarSesion` es firma, no consulta.
 */
export async function InstalarEnBarra() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  if ((await verificarSesion(token)) === null) return null
  return <InstalarBoton />
}
