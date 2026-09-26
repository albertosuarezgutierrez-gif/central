'use client'

import { useLinkStatus } from 'next/link'
import { createPortal } from 'react-dom'

import { CargaAsegura } from '../CargaAsegura'

/**
 * Va DENTRO de cada `<Link>` del menú y enseña el «AS» mientras esa navegación
 * está pendiente. Hace falta además de `loading.tsx` porque las pestañas
 * Recibos/Siniestros son `/boveda?vista=…`: misma ruta, y ahí Next no vuelve a
 * mostrar el `loading` — la pantalla vieja se quedaba quieta sin decir nada.
 *
 * 🚨 Se porta a `<body>`: el cajón del móvil se esconde con `transform`, y un
 * `position: fixed` dentro de un ancestro transformado se posiciona contra ÉL,
 * no contra la pantalla — el indicador saldría fuera de vista con el cajón.
 * El retardo para no parpadear en navegaciones instantáneas va en el CSS.
 */
export function CargandoEnlace() {
  const { pending } = useLinkStatus()
  if (!pending || typeof document === 'undefined') return null
  return createPortal(<CargaAsegura flotante />, document.body)
}
