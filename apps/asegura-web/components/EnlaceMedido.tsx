'use client'

import { type HTMLAttributes, type MouseEvent } from 'react'
import { medir } from '@/lib/medir'
import { PORTAL_URL } from '@/lib/sitio'

interface EnlaceMedidoProps extends HTMLAttributes<HTMLAnchorElement> {
  href: string
  origen: string
  target?: string
  rel?: string
}

/**
 * Un `<a>` que captura el evento de clic y lo mide con PostHog antes de navegar.
 * Props soportadas: `className`, `href`, `style`, `children`, `target`, `rel`, `origen`.
 *
 * Al portal → `cta_portal_click` (el embudo histórico, no cambia de nombre); a
 * cualquier otro sitio → `acceso_click`. Mezclarlos inflaría las entradas al portal
 * con cada clic en una herramienta o en WhatsApp.
 */
export function eventoDeEnlace(href: string): 'cta_portal_click' | 'acceso_click' {
  return href.startsWith(PORTAL_URL) ? 'cta_portal_click' : 'acceso_click'
}

export default function EnlaceMedido({ href, origen, onClick, ...props }: EnlaceMedidoProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Medir es síncrono en PostHog, así que no hace falta preventDefault
    medir(eventoDeEnlace(href), { origen })
    if (onClick) onClick(e)
  }

  return <a href={href} onClick={handleClick} {...props} />
}
