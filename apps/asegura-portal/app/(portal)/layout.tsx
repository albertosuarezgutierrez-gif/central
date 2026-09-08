import { Suspense } from 'react'

import { InstalarApp } from './InstalarApp'
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
      <main className="portal-contenido">
        {/* ARRIBA del contenido (Alberto, 08/09/2026): abajo, detrás de las
            pólizas, en el móvil quedaba fuera de la primera pantalla y nadie lo
            veía — y en iPhone el aviso es lo ÚNICO que explica cómo instalar.
            Cuesta una pantalla una sola vez: al descartarlo se recuerda.
            En el flujo, no flotando: un elemento `position: fixed` no desborda
            —se pone encima—, así que taparía una fila sin que ninguna medición
            de ancho lo delatara. Y aquí dentro y no en la puerta: pedirle
            instalar a quien todavía no ha entrado es ruido. */}
        <InstalarApp />
        {children}
      </main>
    </div>
  )
}
