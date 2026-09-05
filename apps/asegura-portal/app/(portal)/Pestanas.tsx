import Link from 'next/link'

import { pestanasPortal, type VistaBoveda } from '@central/module-seguros-portal'

/**
 * La barra de secciones del portal.
 *
 * 🚨 Son ENLACES, no botones con estado. Consecuencias buscadas: la sección
 * vive en la URL, así que el servidor puede mandar solo la que se pide (antes
 * se montaban las siete de golpe), el botón «atrás» del móvil vuelve a la
 * anterior, y se puede enlazar una sección concreta desde un correo. Con
 * pestañas de cliente, el JSX de todas se renderizaría igual para poder
 * ocultarlo — que es justo el problema que veníamos a resolver.
 *
 * El subrayado de la activa es un `::after` que solo cambia de opacidad, como
 * en la app del corredor: sin medir posiciones ni animar el layout.
 */
export function Pestanas({ activa }: { activa: VistaBoveda | 'autorizaciones' }) {
  return (
    <nav className="pestanas" aria-label="Secciones">
      {pestanasPortal().map((p) => {
        const esActiva = p.vista === null ? activa === 'autorizaciones' : p.vista === activa
        return (
          <Link
            key={p.href}
            href={p.href}
            className="pestana"
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
