import { cookies } from 'next/headers'
import type { ReactNode } from 'react'

import { COOKIE_NAME, verificarSesion } from '@/lib/auth'

/**
 * Pinta a sus hijos solo si HAY sesión.
 *
 * Es la puerta que hasta el 08/09/2026 vivía dentro de `SalirDelPortal`; se
 * saca porque ahora son DOS las acciones de la barra que no tienen sentido sin
 * sesión (instalar la app y salir), y comprobarla dos veces por carga es tirar
 * trabajo — y, peor, dos comprobaciones que un día divergen.
 *
 * 🚨 **Se comprueba VERIFICANDO el token, no viendo que la cookie existe.** Una
 * cookie caducada o manipulada sigue siendo una cookie: con la comprobación
 * barata, quien no tiene sesión vería un «Salir» que no significa nada. Y al
 * revés importa más — si esto no existiera, la portada de quien aún no ha
 * entrado ofrecería salir e instalar.
 *
 * No toca la BD a propósito: `verificarSesion` es firma, no consulta. Esta
 * cabecera la ve TODA la app, incluidas las páginas legales, y una consulta por
 * carga para decidir si se pintan dos botones es un precio que no hay que pagar.
 */
export async function ConSesion({ children }: { children: ReactNode }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  if ((await verificarSesion(token)) === null) return null
  return <>{children}</>
}
