import { cookies } from 'next/headers'
import { Suspense } from 'react'

import { COOKIE_NAME, verificarSesion } from '@/lib/auth'

import { CabeceraEnlaces } from './CabeceraEnlaces'

/**
 * `CabeceraEnlaces` solo con sesión, igual que `SalirDelPortal` (misma comprobación: se VERIFICA el token, no se mira
 * que la cookie exista; sin BD). La cabecera la ven también la entrada y las páginas legales: ahí no hay «Seguros» ni
 * «Herramientas» a los que ir. `Suspense` porque la activa depende de `useSearchParams()`.
 */
export async function CabeceraEnlacesSesion() {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  if ((await verificarSesion(token)) === null) return null
  return (
    <Suspense fallback={null}>
      <CabeceraEnlaces />
    </Suspense>
  )
}
