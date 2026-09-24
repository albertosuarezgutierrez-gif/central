import { Suspense } from 'react'
import { MEDIADOR, telefonoLegible } from '@central/module-seguros'

import { NavPortal } from './NavPortal'
import { BandaCorredor } from './BandaCorredor'

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
 * a renderizarse en cliente. El respaldo reserva el hueco de la barra del menú
 * para que el contenido no salte al montarse — y ya NO lleva la clase
 * `.portal-nav`: desde el 19/09/2026 esa clase es un cajón `position: fixed`,
 * que no ocupa sitio en el flujo y por tanto no reservaría nada.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-shell">
      <BandaCorredor />
      <Suspense fallback={<div className="portal-nav-hueco" aria-hidden />}>
        <NavPortal llamar={{ tel: MEDIADOR.identidad.telefono, numero: telefonoLegible() }} />
      </Suspense>
      <main className="portal-contenido">
        {children}
      </main>
    </div>
  )
}
