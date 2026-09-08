import { cookies } from 'next/headers'

import { COOKIE_NAME, verificarSesion } from '@/lib/auth'

import { Campana } from './Campana'

/**
 * La campana, solo si HAY sesión.
 *
 * 🚨 Misma regla que `SalirDelPortal`: se comprueba VERIFICANDO el token, no
 * viendo que la cookie existe. Sin sesión, la campana pediría `/api/avisos`,
 * recibiría un 401 y pintaría `!` en la portada de quien todavía no ha entrado
 * — un aviso de que algo falla, sobre alguien que no tiene nada que leer.
 *
 * No toca la BD a propósito: `verificarSesion` es firma, no consulta. Esta
 * cabecera la ve TODA la app, incluidas las páginas legales.
 */
export async function CampanaAvisos() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  if ((await verificarSesion(token)) === null) return null
  return <Campana />
}
