import { cookies } from 'next/headers'

import { COOKIE_NAME, verificarSesion } from '@/lib/auth'

import { Sugerencia } from './Sugerencia'

/**
 * El botón de sugerencias de la cabecera, solo si HAY sesión.
 *
 * 🚨 Misma regla que `SalirDelPortal` y `CampanaAvisos`: se comprueba
 * VERIFICANDO el token, no viendo que la cookie existe. Sin sesión,
 * `/api/sugerencia` devuelve 401 y quien escribiera lo haría para nadie.
 *
 * No toca la BD a propósito: `verificarSesion` es firma, no consulta. Esta
 * cabecera la ve TODA la app, incluidas las páginas legales.
 */
export async function SugerenciaBarra() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  if ((await verificarSesion(token)) === null) return null
  return <Sugerencia />
}
