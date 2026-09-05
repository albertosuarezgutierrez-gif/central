import { Suspense } from 'react'

import { NavPortal } from './NavPortal'

/**
 * El armazón de las pantallas con sesión.
 *
 * 🚨 **Vive en el `layout` y no en cada página**, y eso es lo que arregla el
 * fallo que se veía: hasta ahora cada página abría su propio `<main>` con un
 * `maxWidth: 720` en línea, así que en un monitor de 1440 px quedaban ~720 px
 * de márgenes vacíos y la navegación se re-renderizaba en cada pantalla con su
 * estado pasado a mano. Ahora el ancho y la navegación son del armazón; la
 * página solo aporta su contenido.
 *
 * `Suspense` no es decorativo: `NavPortal` lee el parámetro `?vista=` con
 * `useSearchParams()`, y sin el límite de suspensión eso obliga a toda la rama
 * a renderizarse en cliente. El respaldo reserva el hueco del carril para que
 * el contenido no salte al montarse.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <Suspense fallback={<div className="portal-nav portal-nav-hueco" aria-hidden />}>
        <NavPortal />
      </Suspense>
      <main className="portal-contenido">{children}</main>
    </div>
  )
}
