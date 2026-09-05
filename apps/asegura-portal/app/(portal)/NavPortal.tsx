'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { pestanasPortal, vistaDeBoveda } from '@central/module-seguros-portal'

/**
 * La navegación del portal: **un solo `<nav>` con dos formas**.
 *
 * 🚨 El mismo DOM se pinta como carril horizontal en el móvil y como lateral
 * vertical en el escritorio; lo decide `globals.css` (`.portal-nav`), no dos
 * componentes ni dos listas. Dos árboles distintos para la misma navegación es
 * cómo se llega a que una sección exista en una pantalla y no en la otra sin
 * que nada falle — y encima duplica el marcado en cada carga.
 *
 * 🚨 Y en el móvil **no hay hamburguesa a propósito**. Son cuatro secciones: un
 * botón que las esconde detrás de un toque las hace menos visibles que
 * enseñarlas, y esta pantalla la usa gente de 50-70 años. El lateral es para
 * el escritorio, que es donde de verdad sobraba sitio.
 *
 * Son ENLACES, no botones con estado: la sección vive en la URL (ver
 * `vista-portal.ts` del módulo). Por eso la activa se deriva aquí de la ruta y
 * del parámetro, y no baja como prop desde cada página — así el `layout` puede
 * pintar la navegación una sola vez para todas.
 */
export function NavPortal() {
  const ruta = usePathname()
  const params = useSearchParams()
  // `/autorizaciones` es otra RUTA, no un panel de la bóveda; por eso la ruta
  // manda sobre el parámetro y no al revés.
  const enBoveda = ruta === '/boveda'
  const activa = enBoveda ? vistaDeBoveda(params.get('vista') ?? undefined) : null

  return (
    <nav className="portal-nav" aria-label="Secciones">
      {pestanasPortal().map((p) => {
        const esActiva = p.vista === null ? !enBoveda : enBoveda && p.vista === activa
        return (
          <Link
            key={p.href}
            href={p.href}
            className="portal-nav-item"
            // `aria-current="page"` y no `aria-selected`: esto es navegación
            // entre páginas, no un widget de pestañas. Decirle a un lector de
            // pantalla que es un tablist cuando cada clic recarga sería
            // describir algo que no está pasando.
            aria-current={esActiva ? 'page' : undefined}
            data-activa={esActiva ? 'si' : undefined}
          >
            {p.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
