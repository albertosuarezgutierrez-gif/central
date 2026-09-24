'use client'

import { type HTMLAttributes, type MouseEvent } from 'react'
import { medir } from '@/lib/medir'

interface EnlaceMedidoProps extends HTMLAttributes<HTMLAnchorElement> {
  href: string
  origen: string
  target?: string
  rel?: string
}

/**
 * Un `<a>` que captura el evento de clic y lo mide con PostHog antes de navegar.
 * Props soportadas: `className`, `href`, `style`, `children`, `target`, `rel`, `origen`.
 */
export default function EnlaceMedido({ href, origen, onClick, ...props }: EnlaceMedidoProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Medir es síncrono en PostHog, así que no hace falta preventDefault
    medir('cta_portal_click', { origen })
    // Llamar al onClick original si existe
    if (onClick) onClick(e)
  }

  return <a href={href} onClick={handleClick} {...props} />
}
