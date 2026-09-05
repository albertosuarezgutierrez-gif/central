'use client'

// Enlace del pie para volver a abrir el banner de consentimiento.
//
// No es un adorno: el art. 7.3 del RGPD dice que retirar el consentimiento
// tiene que ser tan fácil como darlo. El banner de Cookiebot solo aparece la
// primera vez; sin este enlace, quien acepta sin querer —o cambia de opinión
// dos meses después— no tiene ninguna forma de volver atrás desde la web.
//
// Se pinta como un enlace más de la navegación legal, no como un botón, porque
// vive entre «Privacidad» y «Aviso legal» y lo que se busca ahí es un texto.
// Es un <button> de verdad por accesibilidad: dispara una acción, no navega,
// y así responde a la barra espaciadora y lo anuncia bien un lector de pantalla.
//
// Si no hay analítica configurada no se pinta: sin banner no hay nada que
// cambiar, y un enlace que no hace nada al pulsarlo es peor que su ausencia.
import type { CSSProperties } from 'react'

import { CONFIG_ANALITICA } from '@/lib/analitica'

type VentanaConCookiebot = Window & { Cookiebot?: { renew?: () => void } }

const comoEnlace: CSSProperties = {
  background: 'none',
  border: 0,
  padding: 0,
  font: 'inherit',
  color: 'var(--brand)',
  textDecoration: 'underline',
  cursor: 'pointer',
}

export function CambiarCookies() {
  if (!CONFIG_ANALITICA) return null

  return (
    <button
      type="button"
      style={comoEnlace}
      onClick={() => {
        // `renew()` vuelve a enseñar el diálogo con la elección actual marcada.
        // Si Cookiebot no llegó a cargar (red, bloqueador), no hay nada que
        // abrir: es preferible que el botón no haga nada a que rompa la página.
        ;(window as VentanaConCookiebot).Cookiebot?.renew?.()
      }}
    >
      Cambiar preferencias de cookies
    </button>
  )
}
