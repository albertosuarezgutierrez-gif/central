'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

import { seccionActiva } from '@central/module-seguros-portal'

/**
 * Los dos botones de la cabecera, «Herramientas» y «Seguros» (26/10/2026, decisión de Alberto): la MISMA cabecera que
 * lleva el Portal del Empleado (`apps/rrhh`), donde «Herramientas» es el propio RRHH y «Seguros» enlaza aquí. Son las
 * mismas dos entradas del menú de cinco (`pestanasPortal()`), con la misma regla de «activa» (`seccionActiva`), así que
 * no hay una segunda lista que se separe de la primera.
 *
 * Solo ENLACES (sin estado, sin cajón). Desde 720 px (globals.css `.cabecera-enlaces`): por debajo la barra inferior ya
 * lleva las mismas entradas y la cabecera no tiene sitio (a 320 px el logotipo y los botones de la derecha ocupan todo).
 * El layout raíz solo la monta con sesión (`CabeceraEnlacesSesion`).
 */
export function CabeceraEnlaces() {
  const ruta = usePathname()
  const params = useSearchParams()
  const activa = seccionActiva(ruta, params.get('vista'))
  return (
    <nav className="cabecera-enlaces" aria-label="Herramientas y seguros">
      <Link href="/herramientas" aria-current={activa === 'herramientas' ? 'page' : undefined}>Herramientas</Link>
      <Link href="/boveda" aria-current={activa === 'seguros' ? 'page' : undefined}>Seguros</Link>
    </nav>
  )
}
